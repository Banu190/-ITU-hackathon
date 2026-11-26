from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, BinaryIO

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_logic.audit import record_audit
from app.core.dependencies import Principal
from app.core.exceptions import NotFoundError, ValidationError
from app.data_access.db.models import Dataset, DatasetStatus, Transaction

MAX_BIGINT = 9_223_372_036_854_775_807
REQUIRED_FIELDS = {"transaction_id", "timestamp", "sender", "receiver"}
ACCOUNT_PATTERN = re.compile(r"^[^\x00-\x1f]{1,128}$")


@dataclass(frozen=True, slots=True)
class ParsedTransaction:
    external_id: str
    occurred_at: datetime
    sender: str
    receiver: str
    amount_minor: int
    currency: str
    row_number: int
    extra_data: dict[str, Any]


def inspect_upload(file: BinaryIO, max_size_bytes: int) -> tuple[str, int]:
    file.seek(0)
    digest = hashlib.sha256()
    size = 0
    while chunk := file.read(1024 * 1024):
        size += len(chunk)
        if size > max_size_bytes:
            raise ValidationError(f"File exceeds the {max_size_bytes // (1024 * 1024)} MB limit")
        digest.update(chunk)
    file.seek(0)
    if size == 0:
        raise ValidationError("CSV file is empty")
    return digest.hexdigest(), size


def _parse_timestamp(value: str, row_number: int) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"Row {row_number}: invalid timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValidationError(f"Row {row_number}: timestamp must include a timezone")
    return parsed.astimezone(UTC)


def _parse_amount(row: dict[str, str], row_number: int) -> int:
    raw_minor = (row.get("amount_tiyn") or "").strip()
    raw_major = (row.get("amount") or "").strip()
    try:
        if raw_minor:
            amount = Decimal(raw_minor)
            if amount != amount.to_integral_value():
                raise InvalidOperation
            minor = int(amount)
        elif raw_major:
            amount = Decimal(raw_major)
            converted = amount * 100
            if converted != converted.to_integral_value():
                raise InvalidOperation
            minor = int(converted)
        else:
            raise InvalidOperation
    except (InvalidOperation, ValueError, OverflowError) as exc:
        raise ValidationError(
            f"Row {row_number}: amount must be a valid value with at most two decimal places"
        ) from exc
    if minor <= 0 or minor > MAX_BIGINT:
        raise ValidationError(f"Row {row_number}: amount is outside the supported range")
    return minor


def parse_csv(
    file: BinaryIO,
    *,
    default_currency: str,
    max_rows: int,
) -> list[ParsedTransaction]:
    file.seek(0)
    wrapper = io.TextIOWrapper(file, encoding="utf-8-sig", errors="strict", newline="")
    parsed: list[ParsedTransaction] = []
    try:
        reader = csv.DictReader(wrapper)
        if reader.fieldnames is None:
            raise ValidationError("CSV header is missing")
        normalized_headers = [header.strip() for header in reader.fieldnames]
        if len(normalized_headers) != len(set(normalized_headers)):
            raise ValidationError("CSV contains duplicate column names")
        reader.fieldnames = normalized_headers
        missing = REQUIRED_FIELDS.difference(normalized_headers)
        if missing or not ({"amount", "amount_tiyn"} & set(normalized_headers)):
            required = sorted(REQUIRED_FIELDS | {"amount or amount_tiyn"})
            raise ValidationError(f"CSV must contain fields: {', '.join(required)}")
        seen_ids: set[str] = set()
        for row_number, row in enumerate(reader, start=2):
            if row_number - 1 > max_rows:
                raise ValidationError(f"CSV exceeds the {max_rows} transaction limit")
            if None in row:
                raise ValidationError(f"Row {row_number}: too many columns")
            external_id = (row.get("transaction_id") or "").strip()
            sender = (row.get("sender") or "").strip()
            receiver = (row.get("receiver") or "").strip()
            if not external_id or len(external_id) > 128:
                raise ValidationError(f"Row {row_number}: invalid transaction_id")
            if external_id in seen_ids:
                raise ValidationError(f"Row {row_number}: duplicate transaction_id {external_id}")
            if not ACCOUNT_PATTERN.fullmatch(sender) or not ACCOUNT_PATTERN.fullmatch(receiver):
                raise ValidationError(f"Row {row_number}: invalid sender or receiver")
            if sender == receiver:
                raise ValidationError(f"Row {row_number}: sender and receiver must differ")
            currency = (row.get("currency") or default_currency).strip().upper()
            if not re.fullmatch(r"[A-Z]{3}", currency):
                raise ValidationError(f"Row {row_number}: invalid ISO currency code")
            occurred_at = _parse_timestamp(row.get("timestamp") or "", row_number)
            amount_minor = _parse_amount(row, row_number)
            core_fields = {
                "transaction_id",
                "timestamp",
                "sender",
                "receiver",
                "amount",
                "amount_tiyn",
                "currency",
            }
            extra = {
                key: value
                for key, value in row.items()
                if key not in core_fields and value not in (None, "")
            }
            parsed.append(
                ParsedTransaction(
                    external_id,
                    occurred_at,
                    sender,
                    receiver,
                    amount_minor,
                    currency,
                    row_number,
                    extra,
                )
            )
            seen_ids.add(external_id)
    except UnicodeDecodeError as exc:
        raise ValidationError("CSV must use UTF-8 or UTF-8-SIG encoding") from exc
    except csv.Error as exc:
        raise ValidationError(f"Malformed CSV: {exc}") from exc
    finally:
        wrapper.detach()
        file.seek(0)
    if not parsed:
        raise ValidationError("CSV contains no transaction rows")
    return parsed


async def upload_dataset(
    session: AsyncSession,
    principal: Principal,
    *,
    file: BinaryIO,
    filename: str,
    currency: str,
    max_size_bytes: int,
    max_rows: int,
) -> tuple[Dataset, bool]:
    checksum, _ = await asyncio.to_thread(inspect_upload, file, max_size_bytes)
    existing = await session.scalar(
        select(Dataset).where(
            Dataset.organization_id == principal.organization_id,
            Dataset.checksum == checksum,
        )
    )
    if existing is not None:
        return existing, True
    parsed = await asyncio.to_thread(parse_csv, file, default_currency=currency, max_rows=max_rows)
    source_name = Path(filename or "transactions.csv").name[:255]
    dataset = Dataset(
        organization_id=principal.organization_id,
        uploaded_by_user_id=principal.user_id,
        source_name=source_name,
        checksum=checksum,
        currency=currency.upper(),
        status=DatasetStatus.READY,
        row_count=len(parsed),
    )
    session.add(dataset)
    await session.flush()
    session.add_all(
        [
            Transaction(
                dataset_id=dataset.id,
                external_id=item.external_id,
                occurred_at=item.occurred_at,
                sender_account=item.sender,
                receiver_account=item.receiver,
                amount_minor=item.amount_minor,
                currency=item.currency,
                row_number=item.row_number,
                extra_data=item.extra_data,
            )
            for item in parsed
        ]
    )
    record_audit(
        session,
        action="dataset.uploaded",
        resource_type="dataset",
        resource_id=str(dataset.id),
        organization_id=principal.organization_id,
        user_id=principal.user_id,
        details={"row_count": len(parsed), "checksum": checksum, "source_name": source_name},
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(Dataset).where(
                Dataset.organization_id == principal.organization_id,
                Dataset.checksum == checksum,
            )
        )
        if existing is not None:
            return existing, True
        raise
    await session.refresh(dataset)
    return dataset, False


async def get_dataset(
    session: AsyncSession, organization_id: uuid.UUID, dataset_id: uuid.UUID
) -> Dataset:
    dataset = await session.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.organization_id == organization_id,
        )
    )
    if dataset is None:
        raise NotFoundError("Dataset not found")
    return dataset


async def list_datasets(
    session: AsyncSession,
    organization_id: uuid.UUID,
    *,
    limit: int,
    offset: int,
) -> tuple[list[Dataset], int]:
    base = Dataset.organization_id == organization_id
    total = await session.scalar(select(func.count(Dataset.id)).where(base)) or 0
    items = list(
        (
            await session.scalars(
                select(Dataset)
                .where(base)
                .order_by(Dataset.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return items, total

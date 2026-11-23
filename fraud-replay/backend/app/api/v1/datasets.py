from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    Query,
    Request,
    UploadFile,
    status,
)

from app.api.v1.schemas import (
    AnalysisQueued,
    AnalysisRunOut,
    DatasetPage,
    DatasetSummary,
    DatasetUploadResponse,
    PaginatedTransactions,
)
from app.business_logic.analysis import latest_analysis, queue_analysis
from app.business_logic.datasets import get_dataset, list_datasets, upload_dataset
from app.business_logic.investigations import list_dataset_transactions
from app.core.config import get_settings
from app.core.dependencies import AnalystPrincipal, CurrentPrincipal, DbSession
from app.core.exceptions import ValidationError
from app.core.rate_limit import client_key, rate_limiter

router = APIRouter(prefix="/datasets", tags=["Datasets"])
settings = get_settings()


def dataset_summary(dataset) -> DatasetSummary:
    return DatasetSummary(
        id=dataset.id,
        dataset_id=dataset.id,
        source=dataset.source_name,
        source_name=dataset.source_name,
        checksum=dataset.checksum,
        currency=dataset.currency,
        status=dataset.status,
        row_count=dataset.row_count,
        created_at=dataset.created_at,
    )


@router.post("/upload", response_model=DatasetUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload(
    request: Request,
    session: DbSession,
    principal: AnalystPrincipal,
    file: Annotated[UploadFile, File(description="UTF-8 or UTF-8-SIG transaction CSV")],
    currency: Annotated[str, Form(pattern=r"^[A-Za-z]{3}$")] = "KZT",
) -> DatasetUploadResponse:
    await rate_limiter.check(client_key(request, "upload"), limit=20, window_seconds=60)
    if file.content_type not in {
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }:
        raise ValidationError("Unsupported upload content type")
    dataset, duplicate = await upload_dataset(
        session,
        principal,
        file=file.file,
        filename=file.filename or "transactions.csv",
        currency=currency,
        max_size_bytes=settings.max_upload_size_mb * 1024 * 1024,
        max_rows=settings.max_transactions_per_upload,
    )
    return DatasetUploadResponse(**dataset_summary(dataset).model_dump(), duplicate=duplicate)


@router.get("", response_model=DatasetPage)
async def datasets(
    session: DbSession,
    principal: CurrentPrincipal,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> DatasetPage:
    items, total = await list_datasets(
        session, principal.organization_id, limit=limit, offset=offset
    )
    return DatasetPage(
        items=[dataset_summary(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{dataset_id}", response_model=DatasetSummary)
async def dataset_details(
    dataset_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal
) -> DatasetSummary:
    dataset = await get_dataset(session, principal.organization_id, dataset_id)
    return dataset_summary(dataset)


@router.get("/{dataset_id}/transactions", response_model=PaginatedTransactions)
async def transactions(
    dataset_id: uuid.UUID,
    session: DbSession,
    principal: CurrentPrincipal,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> PaginatedTransactions:
    items, total = await list_dataset_transactions(
        session,
        principal.organization_id,
        dataset_id,
        principal.role,
        limit=limit,
        offset=offset,
    )
    return PaginatedTransactions(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/{dataset_id}/analyze",
    response_model=AnalysisQueued,
    status_code=status.HTTP_202_ACCEPTED,
)
async def analyze(
    dataset_id: uuid.UUID,
    request: Request,
    session: DbSession,
    principal: AnalystPrincipal,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=128),
) -> AnalysisQueued:
    await rate_limiter.check(client_key(request, "analyze"), limit=30, window_seconds=60)
    analysis, job, duplicate = await queue_analysis(
        session,
        principal,
        dataset_id,
        idempotency_key=idempotency_key,
    )
    return AnalysisQueued(
        analysis=AnalysisRunOut.model_validate(analysis),
        job_id=job.id,
        duplicate=duplicate,
    )


@router.get("/{dataset_id}/analysis", response_model=AnalysisRunOut)
async def analysis_status(
    dataset_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal
) -> AnalysisRunOut:
    await get_dataset(session, principal.organization_id, dataset_id)
    analysis = await latest_analysis(session, principal.organization_id, dataset_id)
    return AnalysisRunOut.model_validate(analysis)

import csv
import re
from datetime import datetime, timezone
from decimal import Decimal
from io import StringIO

from .models import Transfer


MAX_BYTES = 1024 * 1024
MAX_ROWS = 1000
REQUIRED_COLUMNS = {"transaction_id", "timestamp", "sender", "receiver", "amount"}
ALIASES = {"id": "transaction_id", "datetime": "timestamp"}
IDENTIFIER = re.compile(r"[\w.-]{1,48}")
AMOUNT = re.compile(r"[0-9]{1,10}(?:[.,][0-9]{1,2})?")
TIMESTAMP = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}"
    r"(?:\.[0-9]{1,6})?)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])"
)


def parse_csv(content: bytes) -> list[Transfer]:
    if len(content) > MAX_BYTES:
        raise ValueError("Размер CSV превышает 1 МБ.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("Сохраните CSV в кодировке UTF-8.") from error

    text = text.lstrip("\r\n")
    if not text.strip():
        raise ValueError("CSV пуст.")
    header = text.splitlines()[0]
    delimiter = ";" if ";" in header else ","
    reader = csv.reader(StringIO(text, newline=""), delimiter=delimiter, strict=True)
    try:
        columns = [column.strip().lower() for column in next(reader)]
        columns = [ALIASES.get(column, column) for column in columns]
        if len(set(columns)) != len(columns):
            raise ValueError("В заголовке CSV есть повторяющиеся столбцы.")
        missing = REQUIRED_COLUMNS.difference(columns)
        if missing:
            raise ValueError("В CSV отсутствуют столбцы: " + ", ".join(sorted(missing)) + ".")

        transfers = []
        ids = set()
        for cells in reader:
            if not cells or not any(cell.strip() for cell in cells):
                continue
            if len(transfers) >= MAX_ROWS:
                raise ValueError(f"В одном файле допускается до {MAX_ROWS} транзакций.")
            if len(cells) != len(columns):
                raise ValueError(f"Строка {reader.line_num}: неверное число столбцов.")
            row = dict(zip(columns, (cell.strip() for cell in cells)))
            try:
                transfer = parse_row(row)
                if transfer.transaction_id in ids:
                    raise ValueError(f"Повторяется ID {transfer.transaction_id}.")
            except ValueError as error:
                raise ValueError(f"Строка {reader.line_num}: {error}") from error
            ids.add(transfer.transaction_id)
            transfers.append(transfer)
    except csv.Error as error:
        raise ValueError(f"Строка {reader.line_num}: некорректный формат CSV.") from error
    if not transfers:
        raise ValueError("В CSV нет транзакций.")
    return transfers


def parse_row(row: dict[str, str]) -> Transfer:
    for column in ("transaction_id", "sender", "receiver"):
        if not IDENTIFIER.fullmatch(row[column]):
            raise ValueError(f"{column} должен содержать 1–48 букв, цифр, точек, дефисов или подчёркиваний.")
    if row["sender"] == row["receiver"]:
        raise ValueError("Отправитель и получатель должны различаться.")
    if "currency" in row and row["currency"].upper() != "KZT":
        raise ValueError("Поддерживаются переводы в KZT.")
    if not AMOUNT.fullmatch(row["amount"]):
        raise ValueError("Сумма должна быть положительным числом с точностью до двух знаков.")
    amount_tiyn = int(Decimal(row["amount"].replace(",", ".")) * 100)
    if amount_tiyn == 0:
        raise ValueError("Сумма должна быть больше нуля.")
    try:
        timestamp = row["timestamp"]
        if not TIMESTAMP.fullmatch(timestamp):
            raise ValueError
        timestamp = datetime.fromisoformat(timestamp).astimezone(timezone.utc)
        if not 1900 <= timestamp.year <= 9998:
            raise ValueError
    except (ValueError, OverflowError) as error:
        raise ValueError("Укажите время в ISO 8601 со смещением, например 2026-11-19T10:00:00+05:00.") from error
    return Transfer(
        transaction_id=row["transaction_id"],
        timestamp=timestamp,
        sender=row["sender"],
        receiver=row["receiver"],
        amount_tiyn=amount_tiyn,
    )

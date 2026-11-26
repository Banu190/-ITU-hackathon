"""Проверка и нормализация входных данных без потери идентификаторов."""
import math
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import pandas as pd

REQUIRED = ("transaction_id", "timestamp", "sender", "receiver", "amount")


class ValidationError(ValueError):
    """Некорректные данные транзакций."""


def normalize(transactions: list[dict]) -> list[dict]:
    if not isinstance(transactions, list):
        raise ValidationError("Ожидается список транзакций")
    result, seen, aware = [], set(), set()
    for index, row in enumerate(transactions, 1):
        if not isinstance(row, dict) or any(k not in row for k in REQUIRED):
            raise ValidationError(f"Строка {index}: отсутствуют обязательные поля")
        item = {}
        for key in REQUIRED:
            value = row[key]
            if value is None or isinstance(value, bool) or not str(value).strip():
                raise ValidationError(f"Строка {index}: пустое или неверное поле {key}")
            item[key] = value
        for key in ("transaction_id", "sender", "receiver"):
            if not isinstance(item[key], str) or item[key] != item[key].strip():
                raise ValidationError(f"Строка {index}: {key} должен быть строкой без крайних пробелов")
        if item["transaction_id"] in seen:
            raise ValidationError(f"Дублирующийся transaction_id: {item['transaction_id']}")
        seen.add(item["transaction_id"])
        try:
            dt = datetime.fromisoformat(str(item["timestamp"]))
            if "T" not in str(item["timestamp"]) and " " not in str(item["timestamp"]):
                raise ValueError("Требуется дата со временем")
            aware.add(dt.utcoffset() is not None)
            if dt.utcoffset() is not None:
                dt = dt.astimezone(timezone.utc)
            value = Decimal(str(item["amount"]))
            if not value.is_finite() or value <= 0 or not math.isfinite(float(value)) or float(value) == 0:
                raise ValueError("Сумма должна быть положительной и конечной")
        except (ValueError, TypeError, InvalidOperation, OverflowError) as exc:
            raise ValidationError(f"Строка {index}: неверная дата или сумма") from exc
        item["timestamp"] = dt.isoformat()
        item["amount"] = int(value) if value == value.to_integral_value() else float(value)
        result.append(item)
    if len(aware) > 1:
        raise ValidationError("Нельзя смешивать даты с часовым поясом и без него")
    return sorted(result, key=lambda t: (t["timestamp"], t["transaction_id"]))


def read_csv(path: str) -> list[dict]:
    try:
        frame = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeError) as exc:
        raise ValidationError(f"Невозможно прочитать CSV: {exc}") from exc
    if any(k not in frame.columns for k in REQUIRED):
        raise ValidationError("CSV должен содержать колонки: " + ",".join(REQUIRED))
    return frame.to_dict(orient="records")

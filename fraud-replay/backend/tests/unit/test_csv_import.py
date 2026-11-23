import io

import pytest

from app.business_logic.datasets import inspect_upload, parse_csv
from app.core.exceptions import ValidationError


def csv_file(body: str) -> io.BytesIO:
    return io.BytesIO(body.encode("utf-8-sig"))


def test_valid_csv_converts_tenge_to_tiyn() -> None:
    file = csv_file(
        "transaction_id,timestamp,sender,receiver,amount,currency\n"
        "T-1,2026-11-24T10:00:00+05:00,A,B,123.45,KZT\n"
    )
    digest, size = inspect_upload(file, 1024)
    parsed = parse_csv(file, default_currency="KZT", max_rows=10)
    assert len(digest) == 64
    assert size > 0
    assert parsed[0].amount_minor == 12_345
    assert parsed[0].occurred_at.isoformat() == "2026-11-24T05:00:00+00:00"


@pytest.mark.parametrize(
    "body",
    [
        "transaction_id,timestamp,sender,receiver,amount\n",
        "transaction_id,timestamp,sender,receiver,amount\nT,2026-01-01T00:00:00,A,B,1\n",
        "transaction_id,timestamp,sender,receiver,amount\nT,2026-01-01T00:00:00Z,A,A,1\n",
        "transaction_id,timestamp,sender,receiver,amount\nT,2026-01-01T00:00:00Z,A,B,-1\n",
        (
            "transaction_id,timestamp,sender,receiver,amount\n"
            "T,2026-01-01T00:00:00Z,A,B,1\n"
            "T,2026-01-01T00:01:00Z,A,C,2\n"
        ),
    ],
)
def test_invalid_csv_is_rejected_atomically(body: str) -> None:
    with pytest.raises(ValidationError):
        parse_csv(csv_file(body), default_currency="KZT", max_rows=10)


def test_upload_size_limit() -> None:
    with pytest.raises(ValidationError):
        inspect_upload(io.BytesIO(b"x" * 11), 10)

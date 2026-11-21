from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.csv_import import MAX_BYTES, parse_csv
from backend.fraud_engine import analyze, simulate
from backend.main import create_app, demo_analysis
from backend.models import Transfer


HEADER = "transaction_id,timestamp,sender,receiver,amount\n"
ROW = "T1,2026-11-19T09:00:00+05:00,A,B,0.01\n"


def test_demo_exercises_all_rules_and_replays_chain():
    result = demo_analysis()
    assert len(result.cases) == 2
    assert {reason.code for tx in result.transactions for reason in tx.reasons} == {
        "new_recipient", "unusual_amount", "frequency", "chain", "splitting",
    }
    chain = result.cases[0]
    assert chain.risk_score == 100
    assert chain.suspicious_transactions == ["TX-2041", "TX-2042", "TX-2043"]
    changed = simulate(result.transactions, "TX-2041")
    assert changed.affected_transaction_ids == ["TX-2041", "TX-2042", "TX-2043"]
    assert changed.affected_turnover_tiyn == 158_000_000
    assert simulate(result.transactions, "TX-2042").affected_transaction_ids == ["TX-2042", "TX-2043"]


def test_chain_uses_previous_sufficient_incoming_transfer():
    time = datetime(2026, 11, 19, tzinfo=timezone.utc)
    transfers = [
        Transfer(transaction_id="T1", timestamp=time, sender="A", receiver="B", amount_tiyn=10_000),
        Transfer(transaction_id="T2", timestamp=time + timedelta(minutes=1), sender="X", receiver="B", amount_tiyn=500),
        Transfer(transaction_id="T3", timestamp=time + timedelta(minutes=2), sender="B", receiver="C", amount_tiyn=5_000),
        Transfer(transaction_id="T4", timestamp=time + timedelta(minutes=18), sender="C", receiver="D", amount_tiyn=100),
    ]
    result = analyze(list(reversed(transfers)), "sample")
    assert result.transactions[2].previous_transfer_id == "T1"
    assert result.transactions[3].previous_transfer_id is None
    assert simulate(result.transactions, "T1").affected_transaction_ids == ["T1", "T3"]
    assert simulate(result.transactions, "T2").affected_transaction_ids == ["T2"]


def test_csv_accepts_bom_semicolon_decimal_comma_and_timezones():
    content = "\ufeffid;datetime;sender;receiver;amount\r\nT1;2026-11-19T09:00:00+05:00;А;Б;10,25\r\n"
    row = parse_csv(content.encode())[0]
    assert row.amount_tiyn == 1025
    assert row.timestamp.isoformat() == "2026-11-19T04:00:00+00:00"


@pytest.mark.parametrize(("content", "error"), [
    (HEADER + ROW + ROW, "Строка 3"),
    (HEADER + ROW.replace("0.01", "-1"), "Строка 2"),
    (HEADER + ROW.replace("0.01", "NaN"), "Строка 2"),
    (HEADER + ROW.replace("+05:00", ""), "ISO 8601"),
    (HEADER + ROW.replace("+05:00", "+05:60"), "ISO 8601"),
    ("transaction_id,sender,receiver,amount\nT1,A,B,10\n", "timestamp"),
    (HEADER, "нет транзакций"),
])
def test_csv_rejects_invalid_data(content, error):
    with pytest.raises(ValueError, match=error):
        parse_csv(content.encode())


def test_dataset_import_is_atomic_and_persists(tmp_path: Path):
    db = tmp_path / "replay.sqlite3"
    with TestClient(create_app(db)) as client:
        demo = client.get("/api/datasets/current").json()
        assert demo["dataset_id"] == 1
        assert client.get("/api/demo.csv").content.startswith(HEADER.encode())
        bad = client.post("/api/datasets/import", files={"file": ("bad.csv", b"foo,bar\n")})
        assert bad.status_code == 422
        large = client.post("/api/datasets/import", files={"file": ("large.csv", b"x" * (MAX_BYTES + 1))})
        assert large.status_code == 413
        assert client.get("/api/datasets/current").json() == demo
        upload = client.post("/api/datasets/import", files={"file": ("fixture.csv", (HEADER + ROW).encode())})
        assert upload.status_code == 201
        imported = upload.json()
        assert imported["source"] == "fixture.csv"
        assert imported["transactions"][0]["risk_score"] == 15
        assert imported["cases"] == []
    with TestClient(create_app(db)) as client:
        assert client.get("/api/datasets/current").json() == imported
        assert client.get("/api/datasets/1/transactions").json() == demo["transactions"]
        assert client.post("/api/datasets/demo").json()["cases"] == demo["cases"]


def test_investigation_api_simulation_and_pdf(tmp_path: Path):
    with TestClient(create_app(tmp_path / "replay.sqlite3")) as client:
        root = "/api/datasets/1/cases"
        case = client.get(root).json()[0]
        endpoint = f"{root}/{case['case_id']}"
        assert client.get(endpoint).json() == case
        simulation = client.get(endpoint + "/what-if", params={"transaction_id": "TX-2041"})
        assert simulation.json()["affected_transaction_ids"] == ["TX-2041", "TX-2042", "TX-2043"]
        assert client.get(endpoint + "/what-if", params={"transaction_id": "TX-2047"}).status_code == 404
        assert client.get(root + "/FR-999").status_code == 404
        pdf = client.get(endpoint + "/report.pdf")
        assert pdf.status_code == 200
        assert pdf.headers["Content-Type"] == "application/pdf"
        assert pdf.headers["Content-Disposition"].endswith('FR-001.pdf"')
        assert pdf.content.startswith(b"%PDF-")

import json
from pathlib import Path

import pytest

from fraud_engine import ValidationError, analyze_csv, analyze_transactions
from fraud_engine.risk_scoring import score_rules


def tx(i="T1", time="2026-11-17T10:00:00", sender="A", receiver="B", amount=100):
    return dict(transaction_id=i, timestamp=time, sender=sender, receiver=receiver, amount=amount)


def test_empty():
    assert analyze_transactions([]) == {"cases": [], "summary": {"total_transactions": 0, "suspicious_transactions": 0, "cases_count": 0}}


def test_normal():
    assert analyze_transactions([tx()])["cases"] == []


@pytest.mark.parametrize("amount", [-1, 0, "NaN", "Infinity", True])
def test_bad_amount(amount):
    with pytest.raises(ValidationError):
        analyze_transactions([tx(amount=amount)])


@pytest.mark.parametrize("field,value", [("timestamp", "bad"), ("timestamp", "2026-11-17"), ("sender", ""), ("receiver", None), ("transaction_id", " ")])
def test_bad_fields(field, value):
    row = tx()
    row[field] = value
    with pytest.raises(ValidationError):
        analyze_transactions([row])


def test_missing_column(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("sender,amount\nA,100\n")
    with pytest.raises(ValidationError):
        analyze_csv(str(path))


def test_bad_csv(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text('transaction_id,timestamp,sender,receiver,amount\n"unclosed')
    with pytest.raises(ValidationError):
        analyze_csv(str(path))


def test_duplicate():
    with pytest.raises(ValidationError):
        analyze_transactions([tx(), tx()])


def test_missing_field():
    with pytest.raises(ValidationError):
        analyze_transactions([{"sender": "A"}])


def test_fallback():
    result = analyze_transactions([tx(amount=500000)])
    assert result["cases"][0]["risk_score"] == 35
    assert "демонстрационный" in result["cases"][0]["reasons"][0]


def test_history():
    rows = [tx(str(i), f"2026-11-17T0{i}:00:00") for i in range(5)]
    rows.append(tx("big", "2026-11-17T10:00:00", amount=500))
    assert analyze_transactions(rows)["cases"][0]["transaction_ids"] == ["big"]


def test_no_future_leakage():
    rows = [tx("first", amount=1000)] + [tx(str(i), f"2026-11-18T0{i}:00:00", amount=1) for i in range(5)]
    assert analyze_transactions(rows)["cases"] == []


def test_repeated_transfers_burst():
    rows = [tx(str(i), f"2026-11-17T10:0{i}:00") for i in range(4)]
    case = analyze_transactions(rows)["cases"][0]
    assert case["risk_score"] == 25
    assert len(case["graph"]["edges"]) == 4


def test_fanout():
    rows = [tx(str(i), f"2026-11-17T10:0{i}:00", receiver=str(i)) for i in range(3)]
    assert analyze_transactions(rows)["cases"][0]["risk_score"] == 40


def test_burst_outside_window():
    rows = [tx(str(i), f"2026-11-17T10:{i*6:02d}:00") for i in range(4)]
    assert analyze_transactions(rows)["cases"] == []


def test_determinism_json_and_no_mutation():
    rows = [tx(str(i), f"2026-11-17T10:0{i}:00", receiver=str(i)) for i in range(4)]
    before = json.dumps(rows)
    result = analyze_transactions(rows)
    assert result == analyze_transactions(list(reversed(rows)))
    assert json.loads(json.dumps(result, allow_nan=False)) == result
    assert json.dumps(rows) == before


def test_timezones():
    with pytest.raises(ValidationError):
        analyze_transactions([tx(), tx("other", time="2026-11-17T10:00:00Z")])


def test_risk_levels():
    assert score_rules(["burst"]) == (25, "low")
    assert score_rules(["large"]) == (35, "medium")
    assert score_rules(["large", "chain", "fanout"]) == (100, "high")
    assert score_rules(["chain", "chain"]) == (60, "high")


def test_demo_files():
    base = Path(__file__).resolve().parents[1] / "data"
    normal = analyze_csv(str(base / "normal_transactions.csv"))
    suspicious = analyze_csv(str(base / "suspicious_transactions.csv"))
    assert normal["summary"]["total_transactions"] >= 30
    assert normal["cases"] == []
    assert suspicious["summary"]["total_transactions"] >= 30
    assert suspicious["summary"] == {"total_transactions": 34, "suspicious_transactions": 12, "cases_count": 4}
    assert {"TX001", "TX002", "TX003", "TX004"}.issubset({i for c in suspicious["cases"] for i in c["transaction_ids"]})

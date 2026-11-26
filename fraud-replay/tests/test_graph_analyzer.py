import pytest

from fraud_engine import analyze_transactions
from fraud_engine.graph_analyzer import build_graph, find_chains
from fraud_engine.schemas import normalize


def chain(times=(0, 2, 4), amounts=(100, 90, 80), accounts="ABCD"):
    return normalize([dict(transaction_id=f"T{i}", timestamp=f"2026-11-17T10:{minute:02d}:00", sender=accounts[i], receiver=accounts[i+1], amount=amounts[i]) for i, minute in enumerate(times)])


def test_chain():
    rows = chain()
    assert find_chains(rows) == [["T0", "T1", "T2"]]
    case = analyze_transactions(rows)["cases"][0]
    assert case["risk_score"] == 60
    assert len(case["graph"]["nodes"]) == 4
    assert case["timeline"] == rows


@pytest.mark.parametrize("times,amounts", [((0, 16, 18), (100, 90, 80)), ((0, 0, 2), (100, 90, 80)), ((0, 2, 4), (100, 69, 60)), ((0, 2, 4), (100, 101, 90))])
def test_chain_constraints(times, amounts):
    assert find_chains(chain(times, amounts)) == []


def test_inclusive_boundaries():
    assert find_chains(chain((0, 15, 30), (100, 70, 49)))


def test_cycle_terminates():
    assert find_chains(chain(accounts="ABCA")) == []


def test_depth_limit():
    assert find_chains(chain(), max_depth=2, min_length=2) == [["T0", "T1"], ["T1", "T2"]]


def test_parallel_edges():
    rows = chain()
    rows.append(dict(rows[0], transaction_id="parallel"))
    assert build_graph(rows).number_of_edges() == 4
    assert len(find_chains(rows)) == 2


def test_reverse_time():
    rows = chain()
    rows[1]["timestamp"] = "2026-11-17T09:00:00"
    assert find_chains(rows) == []

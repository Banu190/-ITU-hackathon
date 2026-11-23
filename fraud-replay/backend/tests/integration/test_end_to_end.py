from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.business_logic.admin import bootstrap_organization_admin
from app.business_logic.analysis import perform_analysis
from app.business_logic.jobs import claim_next_job, mark_completed
from app.data_access.db.session import SessionFactory

TEST_PASSWORD = "Correct-Horse-Battery-42"


def demo_csv() -> bytes:
    rows = ["transaction_id,timestamp,sender,receiver,amount,currency"]
    for index in range(5):
        rows.append(f"H-{index},2026-11-{10 + index:02d}T10:00:00+05:00,A,B,1000,KZT")
    rows.extend(
        [
            "TX-BIG,2026-11-20T10:00:00+05:00,A,X,600000,KZT",
            "TX-C2,2026-11-20T10:05:00+05:00,X,Y,500000,KZT",
            "TX-C3,2026-11-20T10:10:00+05:00,Y,Z,400000,KZT",
            "TX-B1,2026-11-21T10:00:00+05:00,Q,R1,100,KZT",
            "TX-B2,2026-11-21T10:01:00+05:00,Q,R2,100,KZT",
            "TX-B3,2026-11-21T10:02:00+05:00,Q,R3,100,KZT",
            "TX-B4,2026-11-21T10:03:00+05:00,Q,R4,100,KZT",
        ]
    )
    return ("\n".join(rows) + "\n").encode()


@pytest.mark.integration
async def test_complete_business_scenario(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    health = await client.get("/health")
    ready = await client.get("/ready")
    assert health.status_code == 200
    assert ready.status_code == 200

    upload = await client.post(
        "/api/v1/datasets/upload",
        headers=auth_headers,
        files={"file": ("demo.csv", demo_csv(), "text/csv")},
        data={"currency": "KZT"},
    )
    assert upload.status_code == 201, upload.text
    dataset_id = upload.json()["dataset_id"]
    duplicate = await client.post(
        "/api/v1/datasets/upload",
        headers=auth_headers,
        files={"file": ("demo.csv", demo_csv(), "text/csv")},
        data={"currency": "KZT"},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["duplicate"] is True
    assert duplicate.json()["dataset_id"] == dataset_id

    queued = await client.post(f"/api/v1/datasets/{dataset_id}/analyze", headers=auth_headers)
    assert queued.status_code == 202, queued.text
    job_id = queued.json()["job_id"]
    queued_again = await client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        headers={**auth_headers, "Idempotency-Key": "client-retry-with-another-key"},
    )
    assert queued_again.status_code == 202
    assert queued_again.json()["duplicate"] is True
    assert queued_again.json()["job_id"] == job_id

    async with SessionFactory() as session:
        claimed = await claim_next_job(session, "pytest-worker")
    assert claimed is not None
    async with SessionFactory() as session:
        result = await perform_analysis(session, uuid.UUID(claimed.payload["analysis_run_id"]))
    async with SessionFactory() as session:
        await mark_completed(session, claimed.id, result)

    job = await client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers)
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    analysis = await client.get(f"/api/v1/datasets/{dataset_id}/analysis", headers=auth_headers)
    assert analysis.status_code == 200
    assert analysis.json()["status"] == "completed"
    assert analysis.json()["metrics"]["cases_count"] >= 2

    cases = await client.get("/api/v1/investigations", headers=auth_headers)
    assert cases.status_code == 200, cases.text
    assert cases.json()["total"] >= 2
    selected = next(item for item in cases.json()["items"] if "TX-BIG" in item["transaction_ids"])
    case_id = selected["case_id"]
    detail = await client.get(f"/api/v1/investigations/{case_id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["risk_score"] > 0

    graph = await client.get(f"/api/v1/investigations/{case_id}/graph", headers=auth_headers)
    replay = await client.get(f"/api/v1/investigations/{case_id}/replay", headers=auth_headers)
    simulation = await client.post(
        f"/api/v1/investigations/{case_id}/simulate",
        headers=auth_headers,
        json={"blocked_transaction_id": "TX-BIG", "horizon_hours": 24},
    )
    assert graph.status_code == replay.status_code == simulation.status_code == 200
    assert len(graph.json()["edges"]) >= 3
    assert [event["transaction_id"] for event in replay.json()["events"]][:3]
    assert {"TX-C2", "TX-C3"}.issubset(simulation.json()["affected_transaction_ids"])

    changed = await client.patch(
        f"/api/v1/investigations/{case_id}",
        headers=auth_headers,
        json={"status": "in_review", "comment": "Проверка начата"},
    )
    assert changed.status_code == 200
    assert changed.json()["status"] == "in_review"

    report = await client.get(f"/api/v1/investigations/{case_id}/report/pdf", headers=auth_headers)
    assert report.status_code == 200, report.text
    assert report.content.startswith(b"%PDF")
    analytics = await client.get("/api/v1/analytics/overview", headers=auth_headers)
    assert analytics.status_code == 200, analytics.text
    assert analytics.json()["total_transactions"] == 12
    audit = await client.get("/api/v1/admin/audit-events", headers=auth_headers)
    assert audit.status_code == 200
    actions = {event["action"] for event in audit.json()}
    assert {"auth.login", "dataset.uploaded", "analysis.completed", "report.exported"}.issubset(
        actions
    )


@pytest.mark.integration
@pytest.mark.security
async def test_rbac_and_tenant_isolation(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    created = await client.post(
        "/api/v1/admin/users",
        headers=auth_headers,
        json={
            "email": "viewer@example.com",
            "display_name": "Viewer",
            "password": TEST_PASSWORD,
            "role": "read_only_viewer",
        },
    )
    assert created.status_code == 201, created.text
    viewer_login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "viewer@example.com",
            "password": TEST_PASSWORD,
            "organization_slug": "test-bank",
        },
    )
    viewer_headers = {"Authorization": f"Bearer {viewer_login.json()['access_token']}"}
    forbidden = await client.post(
        "/api/v1/datasets/upload",
        headers=viewer_headers,
        files={"file": ("demo.csv", demo_csv(), "text/csv")},
        data={"currency": "KZT"},
    )
    assert forbidden.status_code == 403
    assert (await client.get("/api/v1/datasets")).status_code == 401

    upload = await client.post(
        "/api/v1/datasets/upload",
        headers=auth_headers,
        files={"file": ("demo.csv", demo_csv(), "text/csv")},
        data={"currency": "KZT"},
    )
    dataset_id = upload.json()["dataset_id"]
    async with SessionFactory() as session:
        await bootstrap_organization_admin(
            session,
            organization_name="Other Bank",
            organization_slug="other-bank",
            email="admin@example.org",
            display_name="Other Admin",
            password=TEST_PASSWORD,
        )
    other_login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.org",
            "password": TEST_PASSWORD,
            "organization_slug": "other-bank",
        },
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['access_token']}"}
    isolated = await client.get(f"/api/v1/datasets/{dataset_id}", headers=other_headers)
    assert isolated.status_code == 404

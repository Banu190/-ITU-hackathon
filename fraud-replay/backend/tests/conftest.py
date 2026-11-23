from __future__ import annotations

import os

os.environ["APP_ENV"] = "test"
os.environ["DEBUG"] = "false"
os.environ["DB_NAME"] = "fraud_replay_test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.business_logic.admin import bootstrap_organization_admin
from app.data_access.db.session import SessionFactory, engine
from app.main import app

TEST_PASSWORD = "Correct-Horse-Battery-42"


@pytest_asyncio.fixture
async def clean_database():
    database_name = engine.url.database or ""
    if not database_name.endswith("_test"):
        raise RuntimeError("Tests refuse to truncate a database without the _test suffix")
    tables = [
        "investigation_events",
        "fraud_signals",
        "investigation_transactions",
        "investigations",
        "transactions",
        "analysis_runs",
        "processing_jobs",
        "ml_model_versions",
        "datasets",
        "auth_sessions",
        "audit_events",
        "memberships",
        "users",
        "organizations",
    ]
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE TABLE {', '.join(tables)} CASCADE"))
    yield


@pytest_asyncio.fixture
async def seeded(clean_database):
    async with SessionFactory() as session:
        organization, user = await bootstrap_organization_admin(
            session,
            organization_name="Test Bank",
            organization_slug="test-bank",
            email="admin@example.com",
            display_name="Test Administrator",
            password=TEST_PASSWORD,
        )
    return organization, user


@pytest_asyncio.fixture
async def client(seeded):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as test_client:
        yield test_client


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.com",
            "password": TEST_PASSWORD,
            "organization_slug": "test-bank",
        },
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

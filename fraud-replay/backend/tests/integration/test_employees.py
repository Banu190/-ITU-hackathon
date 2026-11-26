from httpx import AsyncClient
import pytest


@pytest.mark.integration
@pytest.mark.security
async def test_employee_listing_and_access(client: AsyncClient, auth_headers: dict[str, str]):
    listed = await client.get("/api/v1/admin/users", headers=auth_headers)
    assert listed.status_code == 200
    assert any(item["email"] == "admin@example.com" for item in listed.json())
    password = "Demo-Viewer-Password-42"
    created = await client.post("/api/v1/admin/users", headers=auth_headers, json={
        "email": "staff@example.com", "display_name": "Staff", "password": password,
        "role": "read_only_viewer",
    })
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    login = await client.post("/api/v1/auth/login", json={
        "email": "staff@example.com", "password": password, "organization_slug": "test-bank",
    })
    assert login.status_code == 200, login.text
    viewer = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/v1/admin/users", headers=viewer)).status_code == 403
    assert (await client.get("/api/v1/admin/users")).status_code == 401
    disabled = await client.patch(f"/api/v1/admin/users/{user_id}/disable", headers=auth_headers)
    assert disabled.status_code == 204, disabled.text
    listed = await client.get("/api/v1/admin/users", headers=auth_headers)
    assert any(item["id"] == user_id and not item["is_active"] for item in listed.json())
    assert (await client.get("/api/v1/auth/me", headers=viewer)).status_code == 401

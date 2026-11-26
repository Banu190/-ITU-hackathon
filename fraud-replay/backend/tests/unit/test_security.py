from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hashing_and_verification() -> None:
    password_hash = hash_password("Strong-Password-123")
    assert password_hash != "Strong-Password-123"
    assert verify_password("Strong-Password-123", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_password_policy() -> None:
    with pytest.raises(ValueError):
        hash_password("short")


def test_jwt_round_trip() -> None:
    user_id, organization_id, session_id = uuid4(), uuid4(), uuid4()
    token, expires_at = create_access_token(
        user_id=user_id,
        organization_id=organization_id,
        session_id=session_id,
        role="fraud_analyst",
        token_version=3,
    )
    claims = decode_access_token(token)
    assert claims.sub == user_id
    assert claims.org == organization_id
    assert claims.sid == session_id
    assert claims.ver == 3
    assert expires_at > datetime.now(UTC)


def test_expired_jwt_is_rejected() -> None:
    token, _ = create_access_token(
        user_id=uuid4(),
        organization_id=uuid4(),
        session_id=uuid4(),
        role="fraud_analyst",
        token_version=1,
        now=datetime.now(UTC) - timedelta(days=1),
    )
    with pytest.raises(AuthenticationError):
        decode_access_token(token)

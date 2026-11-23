from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_logic.audit import record_audit
from app.core.config import get_settings
from app.core.dependencies import Principal
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.security import (
    create_access_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.data_access.db.models import AuthSession, Membership, Organization, User

settings = get_settings()
_DUMMY_HASH = hash_password("not-a-real-user-password")


async def login(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    organization_slug: str | None,
) -> tuple[str, datetime]:
    normalized_email = email.strip().lower()
    statement = (
        select(User, Membership, Organization)
        .join(Membership, Membership.user_id == User.id)
        .join(Organization, Organization.id == Membership.organization_id)
        .where(User.email == normalized_email)
    )
    if organization_slug:
        statement = statement.where(Organization.slug == organization_slug.lower())
    rows = (await session.execute(statement)).all()
    if not rows:
        verify_password(password, _DUMMY_HASH)
        raise AuthenticationError("Invalid email, password, or organization")
    if not organization_slug and len(rows) > 1:
        raise ValidationError("organization_slug is required for a user with multiple memberships")
    user, membership, organization = rows[0]
    if (
        not verify_password(password, user.password_hash)
        or not user.is_active
        or not membership.is_active
        or not organization.is_active
    ):
        raise AuthenticationError("Invalid email, password, or organization")
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    auth_session = AuthSession(
        user_id=user.id,
        organization_id=organization.id,
        expires_at=expires_at,
    )
    session.add(auth_session)
    await session.flush()
    token, token_expires_at = create_access_token(
        user_id=user.id,
        organization_id=organization.id,
        session_id=auth_session.id,
        role=membership.role.value,
        token_version=user.token_version,
        now=now,
    )
    user.last_login_at = now
    record_audit(
        session,
        action="auth.login",
        resource_type="session",
        resource_id=str(auth_session.id),
        organization_id=organization.id,
        user_id=user.id,
    )
    await session.commit()
    return token, token_expires_at


async def logout(session: AsyncSession, principal: Principal) -> None:
    if principal.auth_session.revoked_at is None:
        principal.auth_session.revoked_at = datetime.now(UTC)
    record_audit(
        session,
        action="auth.logout",
        resource_type="session",
        resource_id=str(principal.auth_session.id),
        organization_id=principal.organization_id,
        user_id=principal.user_id,
    )
    await session.commit()

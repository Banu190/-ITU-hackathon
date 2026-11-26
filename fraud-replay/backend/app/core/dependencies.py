from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import TokenClaims, decode_access_token
from app.data_access.db.models import AuthSession, Membership, Organization, Role, User
from app.data_access.db.session import get_session

bearer_scheme = HTTPBearer(auto_error=False)
DbSession = Annotated[AsyncSession, Depends(get_session)]


@dataclass(slots=True)
class Principal:
    user: User
    organization: Organization
    membership: Membership
    auth_session: AuthSession
    claims: TokenClaims

    @property
    def user_id(self) -> uuid.UUID:
        return self.user.id

    @property
    def organization_id(self) -> uuid.UUID:
        return self.organization.id

    @property
    def role(self) -> Role:
        return self.membership.role


async def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: DbSession,
) -> Principal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError()
    claims = decode_access_token(credentials.credentials)
    statement = (
        select(User, Organization, Membership, AuthSession)
        .join(Membership, Membership.user_id == User.id)
        .join(Organization, Organization.id == Membership.organization_id)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(
            User.id == claims.sub,
            Organization.id == claims.org,
            Membership.organization_id == claims.org,
            AuthSession.id == claims.sid,
            AuthSession.organization_id == claims.org,
        )
    )
    row = (await session.execute(statement)).one_or_none()
    if row is None:
        raise AuthenticationError()
    user, organization, membership, auth_session = row
    now = datetime.now(UTC)
    if (
        not user.is_active
        or not organization.is_active
        or not membership.is_active
        or auth_session.revoked_at is not None
        or auth_session.expires_at <= now
        or user.token_version != claims.ver
        or membership.role.value != claims.role
    ):
        raise AuthenticationError()
    auth_session.last_seen_at = now
    return Principal(user, organization, membership, auth_session, claims)


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


def require_roles(*allowed: Role):
    async def dependency(principal: CurrentPrincipal) -> Principal:
        if principal.role not in allowed:
            raise AuthorizationError()
        return principal

    return dependency


AdminPrincipal = Annotated[Principal, Depends(require_roles(Role.ORGANIZATION_ADMIN))]
AnalystPrincipal = Annotated[
    Principal,
    Depends(require_roles(Role.ORGANIZATION_ADMIN, Role.FRAUD_ANALYST)),
]

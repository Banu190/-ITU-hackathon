from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.api.v1.schemas import AuditEventOut, UserCreate, UserSummary
from app.business_logic.admin import create_user, disable_user
from app.core.dependencies import AdminPrincipal, DbSession
from app.data_access.db.models import AuditEvent

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.post("/users", response_model=UserSummary, status_code=status.HTTP_201_CREATED)
async def create_organization_user(
    payload: UserCreate,
    session: DbSession,
    principal: AdminPrincipal,
) -> UserSummary:
    user, membership = await create_user(
        session,
        principal,
        email=str(payload.email),
        display_name=payload.display_name,
        password=payload.password,
        role=payload.role,
    )
    return UserSummary(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        role=membership.role,
        created_at=user.created_at,
    )


@router.patch("/users/{user_id}/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_organization_user(
    user_id: uuid.UUID,
    session: DbSession,
    principal: AdminPrincipal,
) -> Response:
    await disable_user(session, principal, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/audit-events", response_model=list[AuditEventOut])
async def audit_events(
    session: DbSession,
    principal: AdminPrincipal,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[AuditEventOut]:
    events = list(
        (
            await session.scalars(
                select(AuditEvent)
                .where(AuditEvent.organization_id == principal.organization_id)
                .order_by(AuditEvent.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return [AuditEventOut.model_validate(event) for event in events]

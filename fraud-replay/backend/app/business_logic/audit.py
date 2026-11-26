from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_context
from app.data_access.db.models import AuditEvent


def record_audit(
    session: AsyncSession,
    *,
    action: str,
    resource_type: str,
    organization_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        request_id=request_id_context.get(),
        details=details or {},
    )
    session.add(event)
    return event

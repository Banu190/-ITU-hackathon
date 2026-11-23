from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter

from app.api.v1.schemas import AnalyticsOverview, JobOut
from app.business_logic.analytics import overview
from app.business_logic.jobs import get_job
from app.core.dependencies import CurrentPrincipal, DbSession
from app.data_access.db.models import InvestigationStatus

router = APIRouter(tags=["Analytics and Jobs"])


@router.get("/analytics/overview", response_model=AnalyticsOverview)
async def analytics_overview(
    session: DbSession,
    principal: CurrentPrincipal,
    dataset_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: InvestigationStatus | None = None,
) -> AnalyticsOverview:
    return await overview(
        session,
        principal.organization_id,
        dataset_id=dataset_id,
        date_from=date_from,
        date_to=date_to,
        investigation_status=status,
    )


@router.get("/jobs/{job_id}", response_model=JobOut)
async def job_status(job_id: uuid.UUID, session: DbSession, principal: CurrentPrincipal) -> JobOut:
    job = await get_job(session, principal.organization_id, job_id)
    return JobOut.model_validate(job)

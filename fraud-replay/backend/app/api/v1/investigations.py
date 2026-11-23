from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, Response

from app.api.v1.schemas import (
    GraphResponse,
    InvestigationDetail,
    InvestigationPage,
    InvestigationUpdate,
    ReplayResponse,
    SimulationRequest,
    SimulationResponse,
)
from app.business_logic.investigations import (
    get_investigation,
    investigation_detail,
    investigation_graph,
    investigation_summary,
    list_investigations,
    replay,
    simulate_block,
    update_investigation,
)
from app.business_logic.reports import generate_investigation_pdf
from app.core.dependencies import AnalystPrincipal, CurrentPrincipal, DbSession
from app.data_access.db.models import InvestigationStatus, RiskLevel

router = APIRouter(prefix="/investigations", tags=["Investigations"])


@router.get("", response_model=InvestigationPage)
async def investigations(
    session: DbSession,
    principal: CurrentPrincipal,
    status: InvestigationStatus | None = None,
    risk_level: RiskLevel | None = None,
    search: str | None = Query(default=None, max_length=32),
    dataset_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> InvestigationPage:
    items, total = await list_investigations(
        session,
        principal.organization_id,
        status=status,
        risk_level=risk_level,
        case_search=search,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
    )
    return InvestigationPage(
        items=[investigation_summary(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{case_id}", response_model=InvestigationDetail)
async def investigation(
    case_id: str, session: DbSession, principal: CurrentPrincipal
) -> InvestigationDetail:
    item = await get_investigation(session, principal.organization_id, case_id)
    return investigation_detail(item, principal.role)


@router.patch("/{case_id}", response_model=InvestigationDetail)
async def patch_investigation(
    case_id: str,
    payload: InvestigationUpdate,
    session: DbSession,
    principal: AnalystPrincipal,
) -> InvestigationDetail:
    item = await update_investigation(
        session,
        principal,
        case_id,
        new_status=payload.status,
        comment=payload.comment,
    )
    return investigation_detail(item, principal.role)


@router.get("/{case_id}/graph", response_model=GraphResponse)
async def graph(case_id: str, session: DbSession, principal: CurrentPrincipal) -> GraphResponse:
    item = await get_investigation(session, principal.organization_id, case_id)
    return investigation_graph(item, principal.role)


@router.get("/{case_id}/timeline", response_model=ReplayResponse)
async def timeline(case_id: str, session: DbSession, principal: CurrentPrincipal) -> ReplayResponse:
    item = await get_investigation(session, principal.organization_id, case_id)
    return replay(item, principal.role)


@router.get("/{case_id}/replay", response_model=ReplayResponse)
async def replay_events(
    case_id: str, session: DbSession, principal: CurrentPrincipal
) -> ReplayResponse:
    item = await get_investigation(session, principal.organization_id, case_id)
    return replay(item, principal.role)


@router.post("/{case_id}/simulate", response_model=SimulationResponse)
async def simulate(
    case_id: str,
    payload: SimulationRequest,
    session: DbSession,
    principal: AnalystPrincipal,
) -> SimulationResponse:
    item = await get_investigation(session, principal.organization_id, case_id)
    return await simulate_block(
        session,
        item,
        principal.role,
        blocked_transaction_id=payload.blocked_transaction_id,
        horizon_hours=payload.horizon_hours,
    )


@router.get("/{case_id}/report/pdf", response_class=Response)
async def report(case_id: str, session: DbSession, principal: CurrentPrincipal) -> Response:
    item = await get_investigation(session, principal.organization_id, case_id)
    content = await generate_investigation_pdf(session, principal, item)
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="fraud-replay-{case_id}.pdf"'},
    )

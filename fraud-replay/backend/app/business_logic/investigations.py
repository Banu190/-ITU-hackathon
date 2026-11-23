from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.schemas import (
    GraphEdge,
    GraphNode,
    GraphResponse,
    InvestigationDetail,
    InvestigationSummary,
    ReplayEvent,
    ReplayResponse,
    RiskReason,
    SimulationResponse,
    TransactionOut,
)
from app.business_logic.audit import record_audit
from app.business_logic.datasets import get_dataset
from app.core.dependencies import Principal
from app.core.exceptions import ConflictError, NotFoundError
from app.data_access.db.models import (
    AnalysisRun,
    AnalysisStatus,
    FraudSignal,
    Investigation,
    InvestigationEvent,
    InvestigationStatus,
    InvestigationTransaction,
    RiskLevel,
    Role,
    Transaction,
)

STATUS_TRANSITIONS = {
    InvestigationStatus.NEW: {
        InvestigationStatus.IN_REVIEW,
        InvestigationStatus.FALSE_POSITIVE,
        InvestigationStatus.CLOSED,
    },
    InvestigationStatus.IN_REVIEW: {
        InvestigationStatus.CONFIRMED_SUSPICIOUS,
        InvestigationStatus.FALSE_POSITIVE,
        InvestigationStatus.CLOSED,
    },
    InvestigationStatus.CONFIRMED_SUSPICIOUS: {
        InvestigationStatus.IN_REVIEW,
        InvestigationStatus.CLOSED,
    },
    InvestigationStatus.FALSE_POSITIVE: {
        InvestigationStatus.IN_REVIEW,
        InvestigationStatus.CLOSED,
    },
    InvestigationStatus.CLOSED: set(),
}


def mask_account(account: str, role: Role) -> str:
    if role != Role.READ_ONLY_VIEWER or len(account) <= 8:
        return account
    return f"{account[:4]}***{account[-4:]}"


def _risk_reason(signal: FraudSignal) -> RiskReason:
    return RiskReason(
        code=signal.rule_code,
        title=signal.rule_name,
        description=signal.description,
        points=signal.score_contribution,
        related_transactions=list(signal.related_transaction_ids),
        evidence=dict(signal.evidence),
    )


def _transaction_risk(
    transaction: Transaction, signals: list[FraudSignal], role: Role
) -> TransactionOut:
    relevant = [
        signal for signal in signals if transaction.external_id in signal.related_transaction_ids
    ]
    strongest: dict[str, int] = {}
    for signal in relevant:
        strongest[signal.rule_code] = max(
            strongest.get(signal.rule_code, 0), signal.score_contribution
        )
    score = min(100, sum(strongest.values()))
    level = RiskLevel.HIGH if score >= 70 else RiskLevel.MEDIUM if score >= 35 else RiskLevel.LOW
    return TransactionOut(
        transaction_id=transaction.external_id,
        timestamp=transaction.occurred_at,
        sender=mask_account(transaction.sender_account, role),
        receiver=mask_account(transaction.receiver_account, role),
        amount_tiyn=transaction.amount_minor,
        currency=transaction.currency,
        risk_score=score,
        risk_level=level,
        reasons=[_risk_reason(signal) for signal in relevant],
    )


def _options():
    return (
        selectinload(Investigation.analysis_run),
        selectinload(Investigation.transaction_links).selectinload(
            InvestigationTransaction.transaction
        ),
        selectinload(Investigation.signals),
        selectinload(Investigation.events),
    )


async def get_investigation(
    session: AsyncSession, organization_id: uuid.UUID, case_id: str
) -> Investigation:
    investigation = await session.scalar(
        select(Investigation)
        .where(
            Investigation.organization_id == organization_id,
            Investigation.case_id == case_id,
        )
        .options(*_options())
    )
    if investigation is None:
        raise NotFoundError("Investigation not found")
    return investigation


def investigation_summary(investigation: Investigation) -> InvestigationSummary:
    links = sorted(investigation.transaction_links, key=lambda link: link.sequence_number)
    unique_reasons = list(dict.fromkeys(signal.rule_name for signal in investigation.signals))
    return InvestigationSummary(
        case_id=investigation.case_id,
        dataset_id=investigation.dataset_id,
        title=investigation.title,
        status=investigation.status,
        risk_score=investigation.risk_score,
        risk_level=investigation.risk_level,
        suspicious_transactions=[
            link.transaction.external_id for link in links if link.is_suspicious
        ],
        transaction_ids=[link.transaction.external_id for link in links],
        reasons=unique_reasons,
        created_at=investigation.created_at,
        updated_at=investigation.updated_at,
    )


def investigation_detail(investigation: Investigation, role: Role) -> InvestigationDetail:
    summary = investigation_summary(investigation)
    links = sorted(investigation.transaction_links, key=lambda link: link.sequence_number)
    return InvestigationDetail(
        **summary.model_dump(),
        summary=investigation.summary,
        transactions=[
            _transaction_risk(link.transaction, investigation.signals, role) for link in links
        ],
        signals=[_risk_reason(signal) for signal in investigation.signals],
    )


async def list_investigations(
    session: AsyncSession,
    organization_id: uuid.UUID,
    *,
    status: InvestigationStatus | None,
    risk_level: RiskLevel | None,
    case_search: str | None,
    dataset_id: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[Investigation], int]:
    filters: list[Any] = [Investigation.organization_id == organization_id]
    if status:
        filters.append(Investigation.status == status)
    if risk_level:
        filters.append(Investigation.risk_level == risk_level)
    if case_search:
        filters.append(Investigation.case_id.ilike(f"%{case_search.strip()}%"))
    if dataset_id:
        filters.append(Investigation.dataset_id == dataset_id)
    total = await session.scalar(select(func.count(Investigation.id)).where(*filters)) or 0
    investigations = list(
        (
            await session.scalars(
                select(Investigation)
                .where(*filters)
                .options(*_options())
                .order_by(Investigation.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    return investigations, total


async def update_investigation(
    session: AsyncSession,
    principal: Principal,
    case_id: str,
    *,
    new_status: InvestigationStatus | None,
    comment: str | None,
) -> Investigation:
    investigation = await get_investigation(session, principal.organization_id, case_id)
    old_status = investigation.status
    if new_status is not None and new_status != old_status:
        if new_status not in STATUS_TRANSITIONS[old_status]:
            raise ConflictError(
                f"Invalid status transition from {old_status.value} to {new_status.value}"
            )
        investigation.status = new_status
    if new_status is None and comment is None:
        raise ConflictError("No investigation change was supplied")
    event_type = "status_changed" if new_status and new_status != old_status else "comment_added"
    session.add(
        InvestigationEvent(
            investigation_id=investigation.id,
            actor_user_id=principal.user_id,
            event_type=event_type,
            from_status=old_status.value if event_type == "status_changed" else None,
            to_status=new_status.value if event_type == "status_changed" else None,
            comment=comment,
        )
    )
    record_audit(
        session,
        action=f"investigation.{event_type}",
        resource_type="investigation",
        resource_id=investigation.case_id,
        organization_id=principal.organization_id,
        user_id=principal.user_id,
        details={
            "from_status": old_status.value,
            "to_status": new_status.value if new_status else None,
        },
    )
    await session.commit()
    return await get_investigation(session, principal.organization_id, case_id)


def investigation_graph(investigation: Investigation, role: Role) -> GraphResponse:
    links = sorted(investigation.transaction_links, key=lambda link: link.sequence_number)
    node_scores: dict[str, int] = defaultdict(int)
    edges: list[GraphEdge] = []
    for link in links:
        tx = link.transaction
        scored = _transaction_risk(tx, investigation.signals, role)
        source = mask_account(tx.sender_account, role)
        target = mask_account(tx.receiver_account, role)
        node_scores[source] = max(node_scores[source], scored.risk_score)
        node_scores[target] = max(node_scores[target], scored.risk_score)
        edges.append(
            GraphEdge(
                id=f"edge-{tx.external_id}",
                source=source,
                target=target,
                transaction_id=tx.external_id,
                timestamp=tx.occurred_at,
                amount_tiyn=tx.amount_minor,
                currency=tx.currency,
                risk_score=scored.risk_score,
            )
        )
    return GraphResponse(
        case_id=investigation.case_id,
        nodes=[
            GraphNode(id=account, label=account, risk_score=score)
            for account, score in sorted(node_scores.items())
        ],
        edges=edges,
    )


def replay(investigation: Investigation, role: Role) -> ReplayResponse:
    links = sorted(
        investigation.transaction_links,
        key=lambda link: (
            link.transaction.occurred_at,
            link.transaction.external_id,
            str(link.transaction.id),
        ),
    )
    events: list[ReplayEvent] = []
    for sequence, link in enumerate(links, start=1):
        tx = link.transaction
        scored = _transaction_risk(tx, investigation.signals, role)
        signal_names = [reason.title for reason in scored.reasons]
        events.append(
            ReplayEvent(
                event_id=f"{investigation.case_id}-{sequence:04d}",
                case_id=investigation.case_id,
                transaction_id=tx.external_id,
                timestamp=tx.occurred_at,
                sender=scored.sender,
                receiver=scored.receiver,
                amount_tiyn=tx.amount_minor,
                currency=tx.currency,
                risk_score=scored.risk_score,
                risk_signals=signal_names,
                explanation="; ".join(reason.description for reason in scored.reasons)
                or "Операция включена в связанный сценарий расследования.",
                graph_source=scored.sender,
                graph_target=scored.receiver,
            )
        )
    return ReplayResponse(case_id=investigation.case_id, events=events)


async def simulate_block(
    session: AsyncSession,
    investigation: Investigation,
    role: Role,
    *,
    blocked_transaction_id: str,
    horizon_hours: int,
) -> SimulationResponse:
    linked = {
        link.transaction.external_id: link.transaction for link in investigation.transaction_links
    }
    blocked = linked.get(blocked_transaction_id)
    if blocked is None:
        raise NotFoundError("Blocked transaction is not part of this investigation")
    end_time = blocked.occurred_at + timedelta(hours=horizon_hours)
    candidates = list(
        (
            await session.scalars(
                select(Transaction)
                .where(
                    Transaction.dataset_id == investigation.dataset_id,
                    Transaction.occurred_at >= blocked.occurred_at,
                    Transaction.occurred_at <= end_time,
                )
                .order_by(Transaction.occurred_at, Transaction.external_id, Transaction.id)
            )
        ).all()
    )
    available: dict[str, int] = defaultdict(int)
    available[blocked.receiver_account] = blocked.amount_minor
    affected_ids: list[str] = []
    affected_accounts = {blocked.sender_account, blocked.receiver_account}
    affected_amounts: dict[str, int] = {}
    blocked_order = (blocked.occurred_at, blocked.external_id, str(blocked.id))
    for tx in candidates:
        if (tx.occurred_at, tx.external_id, str(tx.id)) <= blocked_order:
            continue
        traceable = min(tx.amount_minor, available[tx.sender_account])
        if traceable <= 0:
            continue
        available[tx.sender_account] -= traceable
        available[tx.receiver_account] += traceable
        affected_ids.append(tx.external_id)
        affected_amounts[tx.external_id] = traceable
        affected_accounts.update({tx.sender_account, tx.receiver_account})
    return SimulationResponse(
        blocked_transaction_id=blocked.external_id,
        affected_transaction_ids=affected_ids,
        affected_accounts=sorted(mask_account(account, role) for account in affected_accounts),
        affected_turnover_tiyn=sum(affected_amounts.values()),
        graph_change={
            "removed_edge_ids": [f"edge-{blocked.external_id}"],
            "potentially_affected_edge_ids": [f"edge-{item}" for item in affected_ids],
            "traceable_amounts_tiyn": affected_amounts,
            "horizon_hours": horizon_hours,
        },
        explanation=(
            "Результат — контрфактическая оценка по временно согласованному потоку средств. "
            "Затронутые переводы являются потенциальными, а не гарантированно предотвращёнными."
        ),
    )


async def list_dataset_transactions(
    session: AsyncSession,
    organization_id: uuid.UUID,
    dataset_id: uuid.UUID,
    role: Role,
    *,
    limit: int,
    offset: int,
) -> tuple[list[TransactionOut], int]:
    await get_dataset(session, organization_id, dataset_id)
    total = int(
        await session.scalar(
            select(func.count(Transaction.id)).where(Transaction.dataset_id == dataset_id)
        )
        or 0
    )
    transactions = list(
        (
            await session.scalars(
                select(Transaction)
                .where(Transaction.dataset_id == dataset_id)
                .order_by(Transaction.occurred_at, Transaction.external_id)
                .limit(limit)
                .offset(offset)
            )
        ).all()
    )
    analysis_id = await session.scalar(
        select(AnalysisRun.id)
        .where(
            AnalysisRun.organization_id == organization_id,
            AnalysisRun.dataset_id == dataset_id,
            AnalysisRun.status == AnalysisStatus.COMPLETED,
        )
        .order_by(AnalysisRun.completed_at.desc())
        .limit(1)
    )
    signals = (
        list(
            (
                await session.scalars(
                    select(FraudSignal).where(FraudSignal.analysis_run_id == analysis_id)
                )
            ).all()
        )
        if analysis_id
        else []
    )
    return [_transaction_risk(tx, signals, role) for tx in transactions], total

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import AnalyticsOverview
from app.data_access.db.models import (
    AnalysisRun,
    AnalysisStatus,
    Dataset,
    FraudSignal,
    Investigation,
    InvestigationStatus,
    InvestigationTransaction,
    RiskLevel,
    Transaction,
)


async def overview(
    session: AsyncSession,
    organization_id: uuid.UUID,
    *,
    dataset_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    investigation_status: InvestigationStatus | None = None,
) -> AnalyticsOverview:
    dataset_filters: list[Any] = [Dataset.organization_id == organization_id]
    transaction_filters: list[Any] = [Dataset.organization_id == organization_id]
    investigation_filters: list[Any] = [Investigation.organization_id == organization_id]
    if dataset_id:
        dataset_filters.append(Dataset.id == dataset_id)
        transaction_filters.append(Transaction.dataset_id == dataset_id)
        investigation_filters.append(Investigation.dataset_id == dataset_id)
    if date_from:
        transaction_filters.append(Transaction.occurred_at >= date_from)
        investigation_filters.append(Investigation.created_at >= date_from)
    if date_to:
        transaction_filters.append(Transaction.occurred_at <= date_to)
        investigation_filters.append(Investigation.created_at <= date_to)
    if investigation_status:
        investigation_filters.append(Investigation.status == investigation_status)

    total_datasets = (
        await session.scalar(select(func.count(Dataset.id)).where(*dataset_filters)) or 0
    )
    total_transactions, total_volume = (
        await session.execute(
            select(func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount_minor), 0))
            .join(Dataset, Dataset.id == Transaction.dataset_id)
            .where(*transaction_filters)
        )
    ).one()
    total_investigations = (
        await session.scalar(select(func.count(Investigation.id)).where(*investigation_filters))
        or 0
    )
    risk_rows = (
        await session.execute(
            select(Investigation.risk_level, func.count(Investigation.id))
            .where(*investigation_filters)
            .group_by(Investigation.risk_level)
        )
    ).all()
    distribution = {level.value: 0 for level in RiskLevel}
    distribution.update({level.value: count for level, count in risk_rows})

    suspicious_subquery = (
        select(Transaction.id.label("id"), Transaction.amount_minor.label("amount_minor"))
        .join(InvestigationTransaction, InvestigationTransaction.transaction_id == Transaction.id)
        .join(Investigation, Investigation.id == InvestigationTransaction.investigation_id)
        .where(*investigation_filters, InvestigationTransaction.is_suspicious.is_(True))
        .distinct()
        .subquery()
    )
    suspicious_count, suspicious_volume = (
        await session.execute(
            select(
                func.count(suspicious_subquery.c.id),
                func.coalesce(func.sum(suspicious_subquery.c.amount_minor), 0),
            )
        )
    ).one()

    rule_rows = (
        await session.execute(
            select(FraudSignal.rule_code, func.count(FraudSignal.id))
            .join(AnalysisRun, AnalysisRun.id == FraudSignal.analysis_run_id)
            .where(AnalysisRun.organization_id == organization_id)
            .group_by(FraudSignal.rule_code)
        )
    ).all()
    timeline_rows = (
        await session.execute(
            select(
                func.date_trunc("day", Transaction.occurred_at).label("day"),
                func.count(Transaction.id),
            )
            .join(Dataset, Dataset.id == Transaction.dataset_id)
            .where(*transaction_filters)
            .group_by("day")
            .order_by("day")
        )
    ).all()
    duration = await session.scalar(
        select(
            func.avg(
                func.extract("epoch", AnalysisRun.completed_at - AnalysisRun.started_at) * 1000
            )
        ).where(
            AnalysisRun.organization_id == organization_id,
            AnalysisRun.status == AnalysisStatus.COMPLETED,
        )
    )
    return AnalyticsOverview(
        total_transactions=int(total_transactions),
        total_datasets=int(total_datasets),
        total_investigations=int(total_investigations),
        suspicious_transactions=int(suspicious_count),
        high_risk_cases=distribution[RiskLevel.HIGH.value],
        medium_risk_cases=distribution[RiskLevel.MEDIUM.value],
        low_risk_cases=distribution[RiskLevel.LOW.value],
        total_transaction_volume_tiyn=int(total_volume),
        suspicious_transaction_volume_tiyn=int(suspicious_volume),
        risk_distribution=distribution,
        detection_rule_statistics={rule: count for rule, count in rule_rows},
        timeline_statistics=[
            {"date": day.isoformat(), "count": count} for day, count in timeline_rows
        ],
        processing_performance={
            "average_analysis_duration_ms": float(duration) if duration else None
        },
    )

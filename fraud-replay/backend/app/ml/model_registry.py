from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.data_access.db.models import MLModelVersion
from app.fraud_detection.schemas import DetectionSignal, TransactionRecord
from app.ml.inference import infer_anomalies, load_trusted_artifact


async def active_model(session: AsyncSession, organization_id: uuid.UUID) -> MLModelVersion | None:
    statement = (
        select(MLModelVersion)
        .where(
            MLModelVersion.is_active.is_(True),
            or_(
                MLModelVersion.organization_id == organization_id,
                MLModelVersion.organization_id.is_(None),
            ),
        )
        .order_by(
            (MLModelVersion.organization_id == organization_id).desc(),
            MLModelVersion.trained_at.desc(),
        )
        .limit(1)
    )
    return await session.scalar(statement)


async def infer_with_active_model(
    session: AsyncSession,
    organization_id: uuid.UUID,
    transactions: list[TransactionRecord],
) -> tuple[list[DetectionSignal], MLModelVersion | None, str]:
    model_version = await active_model(session, organization_id)
    if model_version is None:
        return [], None, "rules_only_fallback_no_active_model"
    settings = get_settings()
    artifact = load_trusted_artifact(
        model_version.artifact_path,
        model_version.artifact_sha256,
        settings.model_directory,
    )
    return infer_anomalies(transactions, artifact), model_version, "rules_and_isolation_forest"

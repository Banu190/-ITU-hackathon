from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business_logic.audit import record_audit
from app.business_logic.datasets import get_dataset
from app.core.config import get_settings
from app.core.dependencies import Principal
from app.core.exceptions import NotFoundError, ValidationError
from app.data_access.db.models import (
    AnalysisRun,
    AnalysisStatus,
    FraudSignal,
    Investigation,
    InvestigationEvent,
    InvestigationStatus,
    InvestigationTransaction,
    JobStatus,
    JobType,
    MLModelVersion,
    ProcessingJob,
    RiskLevel,
    Transaction,
)
from app.fraud_detection import ENGINE_VERSION
from app.fraud_detection.schemas import DetectionResult, DetectionSignal, TransactionRecord
from app.integrations.fraud_engine import FraudDetectionAdapter
from app.ml.inference import infer_anomalies, load_trusted_artifact
from app.ml.model_registry import active_model

logger = logging.getLogger(__name__)
settings = get_settings()


def _stable_case_id(
    dataset_id: uuid.UUID,
    algorithm_marker: str,
    transaction_ids: tuple[str, ...],
) -> str:
    source = f"{dataset_id}|{algorithm_marker}|{'|'.join(transaction_ids)}"
    return "FR-" + hashlib.sha256(source.encode("utf-8")).hexdigest()[:10].upper()


def _run_detection(
    records: list[TransactionRecord], model: MLModelVersion | None
) -> tuple[DetectionResult, str]:
    ml_signals: list[DetectionSignal] = []
    method = "rules_only_fallback_no_active_model"
    if model is not None:
        artifact = load_trusted_artifact(
            model.artifact_path,
            model.artifact_sha256,
            settings.model_directory,
        )
        ml_signals = infer_anomalies(records, artifact)
        method = "rules_and_isolation_forest"
    result = FraudDetectionAdapter().analyze(records, additional_signals=ml_signals)
    result.metrics["ml_signals_count"] = len(ml_signals)
    result.metrics["detection_method"] = method
    return result, method


async def queue_analysis(
    session: AsyncSession,
    principal: Principal,
    dataset_id: uuid.UUID,
    *,
    idempotency_key: str | None,
) -> tuple[AnalysisRun, ProcessingJob, bool]:
    dataset = await get_dataset(session, principal.organization_id, dataset_id)
    model = await active_model(session, principal.organization_id)
    model_marker = model.version if model else "no-model"
    derived_key = hashlib.sha256(
        f"{dataset.checksum}|{ENGINE_VERSION}|{model_marker}".encode()
    ).hexdigest()
    if idempotency_key is not None and not idempotency_key.strip():
        raise ValidationError("Idempotency-Key cannot be blank")
    # A client retry key cannot duplicate a content-identical analysis.
    key = derived_key
    existing = await session.scalar(
        select(AnalysisRun).where(
            AnalysisRun.dataset_id == dataset.id,
            AnalysisRun.idempotency_key == key,
        )
    )
    if existing is not None:
        job = await session.scalar(
            select(ProcessingJob).where(
                ProcessingJob.organization_id == principal.organization_id,
                ProcessingJob.job_type == JobType.FRAUD_ANALYSIS,
                ProcessingJob.idempotency_key == key,
            )
        )
        if job is None:
            raise NotFoundError("Analysis job state is missing")
        return existing, job, True
    analysis = AnalysisRun(
        organization_id=principal.organization_id,
        dataset_id=dataset.id,
        requested_by_user_id=principal.user_id,
        model_version_id=model.id if model else None,
        idempotency_key=key,
        engine_version=ENGINE_VERSION,
        status=AnalysisStatus.QUEUED,
        detection_method="pending",
    )
    session.add(analysis)
    await session.flush()
    job = ProcessingJob(
        organization_id=principal.organization_id,
        requested_by_user_id=principal.user_id,
        job_type=JobType.FRAUD_ANALYSIS,
        status=JobStatus.QUEUED,
        idempotency_key=key,
        payload={"analysis_run_id": str(analysis.id), "dataset_id": str(dataset.id)},
    )
    session.add(job)
    record_audit(
        session,
        action="analysis.queued",
        resource_type="analysis_run",
        resource_id=str(analysis.id),
        organization_id=principal.organization_id,
        user_id=principal.user_id,
        details={"dataset_id": str(dataset.id), "job_id": str(job.id)},
    )
    await session.commit()
    await session.refresh(analysis)
    await session.refresh(job)
    return analysis, job, False


async def latest_analysis(
    session: AsyncSession, organization_id: uuid.UUID, dataset_id: uuid.UUID
) -> AnalysisRun:
    analysis = await session.scalar(
        select(AnalysisRun)
        .where(
            AnalysisRun.organization_id == organization_id,
            AnalysisRun.dataset_id == dataset_id,
        )
        .order_by(AnalysisRun.created_at.desc())
        .limit(1)
    )
    if analysis is None:
        raise NotFoundError("No analysis exists for this dataset")
    return analysis


async def _load_records(
    session: AsyncSession, dataset_id: uuid.UUID
) -> tuple[list[TransactionRecord], dict[str, Transaction]]:
    transactions = list(
        (
            await session.scalars(
                select(Transaction)
                .where(Transaction.dataset_id == dataset_id)
                .order_by(Transaction.occurred_at, Transaction.external_id)
            )
        ).all()
    )
    records = [
        TransactionRecord(
            tx.id,
            tx.external_id,
            tx.occurred_at,
            tx.sender_account,
            tx.receiver_account,
            tx.amount_minor,
            tx.currency,
        )
        for tx in transactions
    ]
    return records, {tx.external_id: tx for tx in transactions}


async def perform_analysis(session: AsyncSession, analysis_run_id: uuid.UUID) -> dict[str, Any]:
    analysis = await session.scalar(
        select(AnalysisRun).where(AnalysisRun.id == analysis_run_id).with_for_update()
    )
    if analysis is None:
        raise NotFoundError("Analysis run not found")
    if analysis.status == AnalysisStatus.COMPLETED:
        return analysis.metrics
    analysis.status = AnalysisStatus.RUNNING
    analysis.started_at = datetime.now(UTC)
    analysis.error_message = None
    await session.commit()
    started = datetime.now(UTC)
    try:
        records, by_external_id = await _load_records(session, analysis.dataset_id)
        model = (
            await session.get(MLModelVersion, analysis.model_version_id)
            if analysis.model_version_id
            else None
        )
        result, method = await asyncio.to_thread(_run_detection, records, model)
        algorithm_marker = f"{ENGINE_VERSION}:{model.version if model else 'no-model'}"
        for case in result.cases:
            case_id = _stable_case_id(analysis.dataset_id, algorithm_marker, case.transaction_ids)
            investigation = Investigation(
                organization_id=analysis.organization_id,
                dataset_id=analysis.dataset_id,
                analysis_run_id=analysis.id,
                case_id=case_id,
                title=case.title,
                summary=case.summary,
                status=InvestigationStatus.NEW,
                risk_score=case.risk_score,
                risk_level=RiskLevel(case.risk_level),
            )
            session.add(investigation)
            await session.flush()
            session.add(
                InvestigationEvent(
                    investigation_id=investigation.id,
                    actor_user_id=analysis.requested_by_user_id,
                    event_type="created",
                    to_status=InvestigationStatus.NEW.value,
                    event_data={"analysis_run_id": str(analysis.id)},
                )
            )
            for sequence, external_id in enumerate(case.transaction_ids, start=1):
                session.add(
                    InvestigationTransaction(
                        investigation_id=investigation.id,
                        transaction_id=by_external_id[external_id].id,
                        sequence_number=sequence,
                        is_suspicious=True,
                    )
                )
            for signal in case.signals:
                primary = (
                    by_external_id.get(signal.primary_transaction_id)
                    if signal.primary_transaction_id
                    else None
                )
                session.add(
                    FraudSignal(
                        analysis_run_id=analysis.id,
                        investigation_id=investigation.id,
                        transaction_id=primary.id if primary else None,
                        rule_code=signal.rule_code,
                        rule_name=signal.rule_name,
                        description=signal.description,
                        evidence=signal.evidence,
                        related_transaction_ids=list(signal.related_transaction_ids),
                        score_contribution=signal.score_contribution,
                        algorithm_version=signal.algorithm_version,
                    )
                )
        duration_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
        result.metrics["duration_ms"] = duration_ms
        result.metrics["model_version"] = model.version if model else None
        analysis.status = AnalysisStatus.COMPLETED
        analysis.detection_method = method
        analysis.metrics = result.metrics
        analysis.completed_at = datetime.now(UTC)
        record_audit(
            session,
            action="analysis.completed",
            resource_type="analysis_run",
            resource_id=str(analysis.id),
            organization_id=analysis.organization_id,
            user_id=analysis.requested_by_user_id,
            details={
                "dataset_id": str(analysis.dataset_id),
                "cases_count": result.metrics["cases_count"],
                "duration_ms": duration_ms,
            },
        )
        await session.commit()
        logger.info(
            "Fraud analysis completed",
            extra={
                "event": "analysis.completed",
                "dataset_id": str(analysis.dataset_id),
                "duration_ms": duration_ms,
            },
        )
        return result.metrics
    except Exception as exc:
        await session.rollback()
        failed = await session.get(AnalysisRun, analysis_run_id)
        if failed is not None:
            failed.status = AnalysisStatus.FAILED
            failed.error_message = f"{type(exc).__name__}: {str(exc)[:900]}"
            failed.completed_at = datetime.now(UTC)
            await session.commit()
        logger.exception("Fraud analysis failed", extra={"event": "analysis.failed"})
        raise

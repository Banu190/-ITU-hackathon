from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.data_access.db.models import JobStatus, JobType, ProcessingJob

settings = get_settings()


@dataclass(frozen=True, slots=True)
class ClaimedJob:
    id: uuid.UUID
    job_type: JobType
    payload: dict
    attempts: int


async def recover_stale_jobs(session: AsyncSession) -> int:
    cutoff = datetime.now(UTC) - timedelta(minutes=settings.job_timeout_minutes)
    stale = list(
        (
            await session.scalars(
                select(ProcessingJob)
                .where(
                    ProcessingJob.status == JobStatus.RUNNING,
                    ProcessingJob.locked_at < cutoff,
                )
                .with_for_update(skip_locked=True)
            )
        ).all()
    )
    now = datetime.now(UTC)
    for job in stale:
        if job.attempts >= job.max_attempts:
            job.status = JobStatus.FAILED
            job.completed_at = now
            job.error_message = "Job lease expired and retry limit was reached"
        else:
            job.status = JobStatus.RETRY
            job.next_attempt_at = now
        job.locked_at = None
        job.locked_by = None
    if stale:
        await session.commit()
    return len(stale)


async def claim_next_job(session: AsyncSession, worker_id: str) -> ClaimedJob | None:
    now = datetime.now(UTC)
    job = await session.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.status.in_([JobStatus.QUEUED, JobStatus.RETRY]),
            ProcessingJob.next_attempt_at <= now,
        )
        .order_by(ProcessingJob.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if job is None:
        await session.rollback()
        return None
    job.status = JobStatus.RUNNING
    job.locked_at = now
    job.locked_by = worker_id
    job.started_at = job.started_at or now
    job.attempts += 1
    job.progress = 5
    await session.commit()
    return ClaimedJob(job.id, job.job_type, dict(job.payload), job.attempts)


async def mark_completed(session: AsyncSession, job_id: uuid.UUID, result: dict) -> None:
    job = await session.get(ProcessingJob, job_id)
    if job is None:
        raise NotFoundError("Processing job not found")
    job.status = JobStatus.COMPLETED
    job.progress = 100
    job.result_data = result
    job.error_message = None
    job.completed_at = datetime.now(UTC)
    job.locked_at = None
    job.locked_by = None
    await session.commit()


async def mark_failed(session: AsyncSession, job_id: uuid.UUID, exc: Exception) -> None:
    job = await session.get(ProcessingJob, job_id)
    if job is None:
        raise NotFoundError("Processing job not found")
    job.error_message = f"{type(exc).__name__}: {str(exc)[:900]}"
    job.locked_at = None
    job.locked_by = None
    if job.attempts < job.max_attempts:
        job.status = JobStatus.RETRY
        job.next_attempt_at = datetime.now(UTC) + timedelta(seconds=min(300, 2**job.attempts))
        job.progress = 0
    else:
        job.status = JobStatus.FAILED
        job.completed_at = datetime.now(UTC)
    await session.commit()


async def get_job(
    session: AsyncSession, organization_id: uuid.UUID, job_id: uuid.UUID
) -> ProcessingJob:
    job = await session.scalar(
        select(ProcessingJob).where(
            ProcessingJob.id == job_id,
            ProcessingJob.organization_id == organization_id,
        )
    )
    if job is None:
        raise NotFoundError("Processing job not found")
    return job

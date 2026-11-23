from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid

from app.business_logic.analysis import perform_analysis
from app.business_logic.jobs import (
    claim_next_job,
    mark_completed,
    mark_failed,
    recover_stale_jobs,
)
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.data_access.db.models import JobType
from app.data_access.db.session import SessionFactory, close_database

settings = get_settings()
logger = logging.getLogger(__name__)


async def process_one(worker_id: str) -> bool:
    async with SessionFactory() as session:
        claimed = await claim_next_job(session, worker_id)
    if claimed is None:
        return False
    try:
        if claimed.job_type != JobType.FRAUD_ANALYSIS:
            raise ValueError(f"Unsupported job type: {claimed.job_type}")
        analysis_run_id = uuid.UUID(claimed.payload["analysis_run_id"])
        async with SessionFactory() as session:
            result = await perform_analysis(session, analysis_run_id)
        async with SessionFactory() as session:
            await mark_completed(session, claimed.id, result)
        logger.info(
            "Processing job completed",
            extra={"event": "job.completed", "job_id": str(claimed.id)},
        )
    except Exception as exc:
        logger.exception(
            "Processing job failed",
            extra={"event": "job.failed", "job_id": str(claimed.id)},
        )
        async with SessionFactory() as session:
            await mark_failed(session, claimed.id, exc)
    return True


async def run() -> None:
    configure_logging(settings.log_level)
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    async with SessionFactory() as session:
        recovered = await recover_stale_jobs(session)
    logger.info(
        "Worker started",
        extra={"event": "worker.started", "recovered_jobs": recovered},
    )
    try:
        while True:
            processed = await process_one(worker_id)
            if not processed:
                await asyncio.sleep(settings.worker_poll_seconds)
    finally:
        await close_database()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt as exc:
        raise SystemExit(0) from exc

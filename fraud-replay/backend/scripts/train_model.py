from __future__ import annotations

import argparse
import asyncio
import uuid

from sqlalchemy import select, update

from app.core.config import get_settings
from app.data_access.db.models import Dataset, MLModelVersion, Transaction
from app.data_access.db.session import SessionFactory, close_database
from app.fraud_detection.schemas import TransactionRecord
from app.ml.training import train_isolation_forest


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and register an Isolation Forest model")
    parser.add_argument("--dataset-id", required=True, type=uuid.UUID)
    parser.add_argument("--contamination", type=float, default=0.05)
    return parser.parse_args()


async def main() -> None:
    args = arguments()
    if not 0.001 <= args.contamination <= 0.25:
        raise SystemExit("contamination must be between 0.001 and 0.25")
    settings = get_settings()
    async with SessionFactory() as session:
        dataset = await session.get(Dataset, args.dataset_id)
        if dataset is None:
            raise SystemExit("Dataset not found")
        transactions = list(
            (
                await session.scalars(
                    select(Transaction)
                    .where(Transaction.dataset_id == dataset.id)
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
        result = await asyncio.to_thread(
            train_isolation_forest,
            records,
            settings.model_directory,
            contamination=args.contamination,
        )
        await session.execute(
            update(MLModelVersion)
            .where(MLModelVersion.organization_id == dataset.organization_id)
            .values(is_active=False)
        )
        registered = MLModelVersion(
            organization_id=dataset.organization_id,
            version=result.version,
            algorithm="IsolationForest",
            artifact_path=str(result.artifact_path),
            artifact_sha256=result.artifact_sha256,
            feature_schema=result.feature_schema,
            metrics=result.metrics,
            is_active=True,
            trained_at=result.trained_at,
        )
        session.add(registered)
        await session.commit()
        print(f"Registered active model {registered.version}")
    await close_database()


if __name__ == "__main__":
    asyncio.run(main())

from contextlib import asynccontextmanager
import os
from pathlib import Path
from threading import Lock
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Path as ApiPath, Response, UploadFile
from fastapi.staticfiles import StaticFiles

from .csv_import import MAX_BYTES, parse_csv
from .fraud_engine import analyze, simulate
from .models import Analysis, Dataset, Investigation, ScoredTransfer, Simulation
from .report import build_report
from .store import Store


ROOT = Path(__file__).resolve().parents[1]
DEMO_FILE = ROOT / "data" / "demo.csv"
DatasetId = Annotated[int, ApiPath(gt=0, le=2**63 - 1)]
REPORT_LOCK = Lock()


def demo_analysis() -> Analysis:
    return analyze(parse_csv(DEMO_FILE.read_bytes()), "Демонстрационный набор")


def create_app(database: Path | None = None) -> FastAPI:
    store = Store(database or Path(os.environ.get("FRAUD_REPLAY_DB", str(ROOT / "data" / "replay.sqlite3"))))

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        store.initialize()
        store.seed(demo_analysis())
        yield

    app = FastAPI(title="Fraud Replay API", version="1.0.0", lifespan=lifespan)

    def require_dataset(dataset_id: int) -> Dataset:
        dataset = store.get(dataset_id)
        if dataset is None:
            raise HTTPException(404, "Набор транзакций не найден.")
        return dataset

    def require_case(dataset: Dataset, case_id: str) -> Investigation:
        for case in dataset.cases:
            if case.case_id == case_id:
                return case
        raise HTTPException(404, "Расследование не найдено.")

    def case_transactions(dataset: Dataset, case: Investigation) -> list[ScoredTransfer]:
        selected = set(case.transaction_ids)
        return [transfer for transfer in dataset.transactions if transfer.transaction_id in selected]

    @app.get("/api/datasets/current")
    def current_dataset() -> Dataset:
        dataset = store.get()
        if dataset is None:
            raise HTTPException(503, "Данные ещё не готовы.")
        return dataset

    @app.post("/api/datasets/import", status_code=201)
    def import_csv(file: Annotated[UploadFile, File(description="Синтетические транзакции в CSV")]) -> Dataset:
        try:
            content = file.file.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                raise HTTPException(413, "Размер CSV превышает 1 МБ.")
            transfers = parse_csv(content)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        finally:
            file.file.close()
        filename = (file.filename or "").replace("\\", "/").split("/")[-1]
        source = "".join(char for char in filename if char.isprintable())[:128].strip()
        return store.save(analyze(transfers, source or "Импорт CSV"))

    @app.post("/api/datasets/demo", status_code=201)
    def load_demo() -> Dataset:
        return store.save(demo_analysis())

    @app.get("/api/datasets/{dataset_id}/transactions")
    def transactions(dataset_id: DatasetId) -> list[ScoredTransfer]:
        return require_dataset(dataset_id).transactions

    @app.get("/api/datasets/{dataset_id}/cases")
    def cases(dataset_id: DatasetId) -> list[Investigation]:
        return require_dataset(dataset_id).cases

    @app.get("/api/datasets/{dataset_id}/cases/{case_id}")
    def investigation(dataset_id: DatasetId, case_id: str) -> Investigation:
        return require_case(require_dataset(dataset_id), case_id)

    @app.get("/api/datasets/{dataset_id}/cases/{case_id}/what-if")
    def what_if(dataset_id: DatasetId, case_id: str, transaction_id: str) -> Simulation:
        dataset = require_dataset(dataset_id)
        case = require_case(dataset, case_id)
        if transaction_id not in case.transaction_ids:
            raise HTTPException(404, "Операция не найдена в расследовании.")
        return simulate(case_transactions(dataset, case), transaction_id)

    @app.get(
        "/api/datasets/{dataset_id}/cases/{case_id}/report.pdf",
        response_class=Response,
        responses={200: {"content": {"application/pdf": {}}}},
    )
    def report(dataset_id: DatasetId, case_id: str) -> Response:
        dataset = require_dataset(dataset_id)
        case = require_case(dataset, case_id)
        try:
            with REPORT_LOCK:
                pdf = build_report(dataset, case, case_transactions(dataset, case))
        except FileNotFoundError as error:
            raise HTTPException(503, str(error)) from error
        return Response(pdf, media_type="application/pdf", headers={
            "Content-Disposition": f'attachment; filename="fraud-replay-{dataset_id}-{case.case_id}.pdf"',
        })

    @app.get("/api/demo.csv", response_class=Response)
    def demo_csv() -> Response:
        return Response(DEMO_FILE.read_bytes(), media_type="text/csv; charset=utf-8", headers={
            "Content-Disposition": 'attachment; filename="fraud-replay-demo.csv"',
        })

    if (ROOT / "dist" / "index.html").is_file():
        app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
    return app


app = create_app()

from contextlib import closing
from pathlib import Path
import sqlite3

from .models import Analysis, Dataset


class Store:
    def __init__(self, path: Path):
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS datasets (
                    id INTEGER PRIMARY KEY, analysis TEXT NOT NULL
                )
            """)

    def save(self, analysis: Analysis) -> Dataset:
        with closing(sqlite3.connect(self.path)) as db, db:
            cursor = db.execute("INSERT INTO datasets (analysis) VALUES (?)", (analysis.model_dump_json(),))
            return Dataset(dataset_id=cursor.lastrowid, **analysis.model_dump())

    def seed(self, demo: Analysis) -> None:
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("INSERT OR IGNORE INTO datasets (id, analysis) VALUES (1, ?)", (demo.model_dump_json(),))

    def get(self, dataset_id: int | None = None) -> Dataset | None:
        with closing(sqlite3.connect(self.path)) as db:
            if dataset_id is None:
                row = db.execute("SELECT id, analysis FROM datasets ORDER BY id DESC LIMIT 1").fetchone()
            else:
                row = db.execute("SELECT id, analysis FROM datasets WHERE id = ?", (dataset_id,)).fetchone()
        if row is None:
            return None
        return Dataset(dataset_id=row[0], **Analysis.model_validate_json(row[1]).model_dump())

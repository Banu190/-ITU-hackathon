# FRAUD REPLAY — integration candidate

Bank fraud investigation platform for ITU Hackathon 2026. This branch assembles the PostgreSQL backend and Front1 UI. Front2 and Front3 are alternative UIs and remain in their original branches. No original branch is modified.

## Run locally

Use Python 3.12/3.13, Node.js and Docker Desktop. From `backend/`, create a local `.env` with `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET_KEY` (32+ characters), `APP_ENV=development`, `PORT=8000` and `CORS_ORIGINS=["http://localhost:5173"]`. Do not commit it. See [backend README](backend/README.md) for exact configuration and admin bootstrap.

```sh
cd backend
docker compose --env-file .env up --build -d
docker compose ps
docker compose exec api python scripts/bootstrap_admin.py --organization-name "Demo Bank" --organization-slug demo-bank --email admin@example.com --display-name "Demo Admin"
```

In a separate terminal from this directory:

```sh
npm ci
npm run build
npm run dev
```

Frontend: http://localhost:5173; Swagger: http://127.0.0.1:8000/docs. Use the account created above. Upload `data/suspicious_transactions_kzt.csv` or `data/demo.csv`. The `_kzt` variants assume the source timestamps were Kazakhstan local time (UTC+05:00); originals are preserved.

## Detection engines

The API uses the backend's native fraud engine, with optional Isolation Forest if a trained model is registered. The separate team engine is included as a reference/QA CLI and is **not** yet invoked by the API. The different rule weights and input/output contracts must be reconciled before enabling it in the worker. Do not sum their risk scores.

Run the separate team tests from this directory in an isolated virtual environment with `backend/fraud_engine/requirements.txt` installed:

```sh
python -m pytest -q tests
python -m backend.fraud_engine.cli --input data/suspicious_transactions.csv --output result.json
```

The main backend tests are described in `backend/README.md`; use a dedicated test database. Frontend lint/build and live end-to-end testing are required before submission. This is an unverified integration candidate, not a tested release.

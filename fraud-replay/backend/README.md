# Fraud Replay Backend

Fraud Replay — backend платформы расследования банковского мошенничества. Сервис загружает
транзакции из CSV, сохраняет их в PostgreSQL, запускает детерминированные fraud-правила и
опциональный Isolation Forest, формирует расследования, граф, Replay timeline, what-if оценку и
PDF-отчёт.

Проект является production-oriented модульным монолитом. Это инженерная основа продукта, но не
подтверждение готовности к эксплуатации в банке: перед production нужны независимый security
review, нагрузочные испытания, правовая проверка, калибровка правил и ML на репрезентативных данных.

## Стек

- Python 3.12 в Docker; локально поддерживаются Python 3.12–3.13.
- FastAPI, Pydantic v2, SQLAlchemy 2 Async ORM, asyncpg, Alembic.
- PostgreSQL 13+; Docker использует PostgreSQL 17.7.
- Pandas, NumPy, Scikit-learn Isolation Forest, NetworkX, Joblib.
- JWT, Argon2, RBAC, отзываемые серверные сессии, tenant isolation.
- Pytest, HTTPX, pytest-asyncio, coverage, Ruff.

## Архитектура

```text
HTTP / OpenAPI
  -> app/api                 маршрутизация, DTO и HTTP-коды
  -> app/business_logic      сценарии приложения и транзакции
  -> app/data_access         SQLAlchemy ORM и PostgreSQL
  -> app/fraud_detection     правила, risk score и graph analysis
  -> app/ml                  point-in-time features, training, inference
  -> app/integrations        стабильная граница внешнего Fraud Engine
  -> app/workers             PostgreSQL-backed обработчик задач
```

Долгие анализы не выполняются в API-процессе. Endpoint создаёт `ProcessingJob`; отдельный worker
получает задания через `FOR UPDATE SKIP LOCKED`, поддерживает lease recovery, retry и idempotency.

Основные файлы:

```text
backend/
├── app/
│   ├── api/v1/
│   ├── business_logic/
│   ├── core/
│   ├── data_access/db/
│   ├── fraud_detection/
│   ├── integrations/fraud_engine/
│   ├── ml/
│   ├── workers/
│   └── main.py
├── alembic/versions/
├── scripts/
├── tests/{unit,integration}/
├── .env                  локальный, исключён из Git и Docker image
├── requirements.txt
├── pyproject.toml
├── alembic.ini
├── Dockerfile
└── compose.yaml
```

## Модель данных

Начальная миграция создаёт:

- `organizations`, `users`, `memberships`, `auth_sessions`;
- `datasets`, `transactions`;
- `analysis_runs`, `processing_jobs`, `ml_model_versions`;
- `investigations`, `investigation_transactions`, `fraud_signals`, `investigation_events`;
- неизменяемый через API журнал `audit_events`.

Внутренние ID — UUID. Суммы хранятся в `BIGINT` в минимальных денежных единицах. Время хранится с
timezone и нормализуется в UTC. Внешний `transaction_id` уникален внутри dataset.

## Локальная установка — Windows PowerShell

Все команды этого раздела выполняются в терминале VS Code PowerShell из каталога
`fraud-replay\backend`.

Проверить интерпретаторы:

```powershell
py -0p
```

Создать окружение Python 3.12:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e ".[test]"
```

На проверенной машине Python 3.12 отсутствовал, поэтому локальные тесты фактически выполнены на
Python 3.13.7 командой `py -3.13 -m venv .venv`. Контейнер использует Python 3.12.12.

## `.env`

Локальный `backend/.env` уже создан и исключён через `.gitignore`. Он содержит development-настройки
PostgreSQL и криптографически сгенерированный JWT secret. Не коммитьте и не выводите файл целиком.

Обязательные группы переменных:

- `APP_NAME`, `APP_ENV`, `DEBUG`, `HOST`, `PORT`;
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`;
- `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`;
- `CORS_ORIGINS`, лимиты CSV, logging, worker и model directory.

В production пароль `admin` запрещён валидатором запуска. Production secrets должны поступать из
secret manager или защищённых переменных окружения.

## PostgreSQL и миграции

Локально обнаружен и проверен PostgreSQL Server 13.23. Версию можно проверить в pgAdmin Query Tool:

```sql
SELECT version();
```

Если базы ещё нет, подключитесь в pgAdmin к базе `postgres` и выполните:

```sql
CREATE DATABASE fraud_replay ENCODING 'UTF8';
CREATE DATABASE fraud_replay_test ENCODING 'UTF8';
```

Тестовая БД обязательна: тесты отказываются выполнять очистку базы, имя которой не заканчивается на
`_test`.

Применить и проверить миграции:

```powershell
python -m alembic upgrade head
python -m alembic current
python -m alembic check
```

Таблицы штатно создаются только Alembic. `create_all()` не используется.

## Первый администратор

Публичной регистрации аналитиков нет. После миграции создайте организацию и первого администратора:

```powershell
python .\scripts\bootstrap_admin.py `
  --organization-name "Demo Bank" `
  --organization-slug "demo-bank" `
  --email "admin@example.com" `
  --display-name "Demo Administrator"
```

Пароль вводится скрыто и должен содержать минимум 12 символов. Других пользователей создаёт
Organization Admin через `POST /api/v1/admin/users`.

## Запуск без Docker

Терминал 1 — API:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Терминал 2 — worker:

```powershell
.\.venv\Scripts\Activate.ps1
python -m app.workers.runner
```

Проверка:

- liveness: `http://127.0.0.1:8000/health`;
- readiness PostgreSQL: `http://127.0.0.1:8000/ready`;
- Swagger: `http://127.0.0.1:8000/docs`;
- OpenAPI: `http://127.0.0.1:8000/openapi.json`.

Swagger и OpenAPI endpoint отключаются при `APP_ENV=production`.

## Docker Compose

Из `fraud-replay\backend`:

```powershell
docker compose --env-file .env config --quiet
docker compose --env-file .env up --build -d
docker compose ps
docker compose logs -f api worker
```

Сервисы: `postgres`, one-shot `migrate`, `api`, `worker`. PostgreSQL доступен только внутри Compose
сети как `postgres:5432` и по умолчанию не публикуется на Windows host, поэтому не конфликтует с
локальным PostgreSQL на `localhost:5432`. Для доступа из host pgAdmin добавьте локальный Compose
override с незанятым портом только на время диагностики.

Остановка без удаления данных:

```powershell
docker compose down
```

Команда `docker compose down -v` удаляет volume базы и все Docker-данные проекта; применяйте её только
осознанно.

## Формат CSV

Минимальный заголовок:

```csv
transaction_id,timestamp,sender,receiver,amount
TX-001,2026-11-24T10:00:00+05:00,ACC-100,ACC-200,1234.50
```

`amount` — сумма в основной денежной единице и конвертируется в тиыны без float. Вместо неё можно
передать целое `amount_tiyn`. Опциональная колонка `currency` — ISO 4217, по умолчанию KZT. Timestamp
обязан содержать timezone. Импорт UTF-8/UTF-8-SIG атомарный; повторный файл определяется по SHA-256.

## Fraud Detection и ML

Встроенный движок вычисляет объяснимые правила:

- Large Transaction;
- Transaction Burst;
- Fan-Out;
- Transfer Chain;
- New Beneficiary;
- Unusual Activity.

Сигнал сохраняет code, description, evidence, связанные transaction IDs, вклад в score и версию
алгоритма. Score 0–100 — приоритет проверки, не вероятность мошенничества.

ML использует point-in-time признаки: сумма, относительное отклонение, velocity, уникальные
получатели, историческая частота, время после предыдущей операции, fan-out, глубина цепочки и степени
графа. При отсутствии активной модели анализ честно работает в `rules_only_fallback_no_active_model`.

Обучение на сохранённом dataset (минимум 50 транзакций):

```powershell
python .\scripts\train_model.py --dataset-id "<DATASET_UUID>" --contamination 0.05
```

Joblib загружается только из доверенного `MODEL_DIR`, после проверки пути, схемы и SHA-256.

## REST API `/api/v1`

| Метод | Endpoint | Назначение |
|---|---|---|
| POST | `/auth/login` | JWT login |
| POST | `/auth/logout` | отзыв текущей сессии |
| GET | `/auth/me` | профиль и роль |
| POST | `/admin/users` | контролируемое создание пользователя |
| GET | `/admin/audit-events` | аудит организации |
| POST | `/datasets/upload` | атомарный CSV import |
| GET | `/datasets` | datasets с pagination |
| GET | `/datasets/{id}` | dataset |
| GET | `/datasets/{id}/transactions` | транзакции и risk reasons |
| POST | `/datasets/{id}/analyze` | idempotent постановка анализа в очередь |
| GET | `/datasets/{id}/analysis` | последний analysis run |
| GET/PATCH | `/investigations/{case_id}` | просмотр и workflow статуса |
| GET | `/investigations/{case_id}/graph` | React Flow-ready graph |
| GET | `/investigations/{case_id}/timeline` | стабильный timeline |
| GET | `/investigations/{case_id}/replay` | Replay events |
| POST | `/investigations/{case_id}/simulate` | what-if block simulation |
| GET | `/investigations/{case_id}/report/pdf` | PDF расследования |
| GET | `/analytics/overview` | dashboard aggregations |
| GET | `/jobs/{job_id}` | status фонового задания |

Ошибки имеют единый контракт:

```json
{
  "code": "validation_error",
  "detail": "Human-readable message",
  "request_id": "correlation-id",
  "context": {}
}
```

## Контракт frontend

- Base URL хранить в `VITE_API_URL`; не дублировать по компонентам.
- Передавать `Authorization: Bearer <token>`.
- `dataset_id` и внутренние ID — UUID strings.
- Денежное поле в ответах — целое `amount_tiyn`.
- `risk_level`: `low | medium | high`.
- upload — `multipart/form-data` с полями `file` и `currency`.
- analyze возвращает HTTP 202 и `job_id`; Zustand может polling-ом читать `/jobs/{job_id}`.
- graph возвращает `nodes[]` и `edges[]` с `source`, `target`, `transaction_id`.
- Play/Pause/Restart и скорость Replay остаются frontend-логикой.
- viewer получает маскированные длинные account IDs; analyst/admin — полные ID.
- CORS development origin: `http://localhost:5173`.

Существующие frontend-типы сохраняют смысл `Transfer`, `Investigation`, `Simulation`, `RiskLevel` и
`amount_tiyn`; ожидаемое изменение — тип `dataset_id` с `number` на `string` UUID и pagination wrapper
`{items,total,limit,offset}`.

## Тесты

```powershell
python -m ruff check .
python -m pytest -q
python -m pytest -q --cov=app --cov-report=term-missing
```

Integration/security тесты используют только `fraud_replay_test`. Сценарий проверяет login, CSV,
идемпотентность, job processing, fraud signals, investigation, graph, replay, what-if, PDF, audit,
RBAC и tenant isolation.

## Production требования и ограничения

- TLS и trusted reverse proxy/API gateway обязательны.
- In-memory rate limiter подходит одному API-процессу; кластеру нужен общий gateway limiter.
- Нужны внешние metrics/tracing, backup/PITR, rotation secrets и формальная retention job.
- Автоматическое удаление по `DATA_RETENTION_DAYS` пока не реализовано.
- Rule thresholds и Isolation Forest не калиброваны на реальном банковском потоке.
- PostgreSQL worker подходит текущему объёму; перед масштабированием нужны load/chaos tests.
- Нет refresh token flow; короткие access tokens и server-side revocation реализованы.
- Внешняя ветка Fraud Engine не объединялась; подключение предусмотрено через adapter.
- PDF использует системный Arial на Windows или DejaVu Sans в Docker.
- Не логируются пароли, JWT, DB credentials и полные payload транзакций.

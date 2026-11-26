# FRAUD REPLAY

Интеллектуальная платформа расследования подозрительных банковских переводов. ITU Hackathon 2026 — FinTech Case от Банка ЦентрКредит.

**Проблема:** аналитику необходимо быстро восстановить последовательность подозрительных переводов и понять причины риска. **Решение:** импорт CSV, гибридное обнаружение аномалий, интерактивный граф, пошаговый Replay, What-if и PDF-отчёт. Целевая аудитория — специалисты банковского антифрода и финансовой безопасности.

## Возможности

- CSV → PostgreSQL → фоновый анализ → расследования с объяснимыми сигналами риска.
- Шесть эвристических правил, включая командные алгоритмы цепочек и серий операций; опционально Isolation Forest (200 деревьев, 10 признаков).
- Risk Score 0–100, граф счетов, Replay, условная блокировка What-if.
- JWT, Argon2, роли администратора, аналитика и наблюдателя; журнал аудита и PDF.

## Запуск с нуля (Windows CMD)

Требуются Git, Docker Desktop, Python 3.12/3.13 (для генерации секрета), Node.js и npm. Из каталога `fraud-replay` перейдите в `backend` и создайте локальный файл `.env` (не коммитьте). Минимальная конфигурация:

```dotenv
APP_ENV=development
DEBUG=false
PORT=8000
DB_HOST=postgres
DB_PORT=5432
DB_NAME=fraud_replay
DB_USER=postgres
DB_PASSWORD=replace-with-local-password
JWT_SECRET_KEY=replace-with-random-secret-at-least-32-characters
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

Генерация JWT secret: `python -c "import secrets; print(secrets.token_hex(32))"`.

```cmd
cd backend
docker compose config --quiet
docker compose up --build -d
docker compose ps -a
docker compose exec api python -m scripts.bootstrap_admin --organization-name "Demo Bank" --organization-slug demo-bank --email admin@example.com --display-name Administrator
```

При первом запуске задайте пароль администратора (от 12 символов). При повторных запусках bootstrap не нужен, данные сохраняются в Docker Volume.

В другом терминале из каталога `fraud-replay`:

```cmd
npm ci
npm run build
npm run dev
```

Если npm сообщает о рассинхронизации lockfile, выполните `npm install`, затем повторите сборку. Интерфейс: http://localhost:5173. Swagger: http://localhost:8000/docs. Авторизуйтесь с созданной учётной записью и кодом `demo-bank`.

## Демонстрация

1. Без ML загрузите `data/suspicious_transactions_kzt.csv` (34 операции). Откройте расследование с цепочкой переводов, граф, Replay, What-if и скачайте PDF.
2. Для сравнения используйте `data/normal_transactions_kzt.csv` (30 обычных операций).
3. ML: загрузите `data/ml_training.csv` через интерфейс (это может также запустить обычный анализ), затем в `backend` получите ID:

```cmd
docker compose exec postgres psql -U postgres -d fraud_replay -c "SELECT id, source_name, row_count FROM datasets WHERE source_name = 'ml_training.csv';"
```

Подставьте фактический UUID в команду:

```cmd
docker compose exec worker python -m scripts.train_model --dataset-id=DATASET_UUID --contamination=0.05
```

Обученная модель хранится в общем Docker Volume API и worker; для нового окружения модель нужно обучить. Загрузите `data/ml_suspicious_demo.csv` и проверьте PDF: `rules_and_isolation_forest`, сигнал `ML Anomaly`. Для проверки обычных операций с ML используйте `data/ml_normal_check.csv`.

## Архитектура и тестирование

React + TypeScript + Vite + React Flow → FastAPI REST API → SQLAlchemy Async + PostgreSQL; Alembic, worker, NetworkX, Pandas, NumPy, Scikit-learn, ReportLab, Docker Compose.

Frontend: `npm run build`, `npm run lint`. Backend: тесты `backend/tests` (отдельная БД `fraud_replay_test`), инструкция [backend/README.md](backend/README.md). Командный алгоритм: `tests/`, изолированное окружение с `backend/fraud_engine/requirements.txt`.

Рабочий MVP до финальной доработки раздела сотрудников: 19 backend-тестов и 36 тестов командного модуля. Проверены импорт, расследования, граф, Replay, What-if, PDF и гибридный анализ на синтетике. Финальные тесты необходимо повторять после изменений.

## Ограничения

Прототип для хакатона, не готовый к банковскому production. Данные синтетические. Risk Score — приоритет проверки, не вероятность мошенничества. ML требует независимой валидации и калибровки. What-if моделирует потенциально затронутые переводы, не выполняет блокировку и не гарантирует предотвращение потерь. Низкорисковые информационные сигналы могут возникать в обычных операциях.

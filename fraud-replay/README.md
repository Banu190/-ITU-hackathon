# Fraud Replay

Фронтенд для расследования подозрительных переводов на React, TypeScript и Vite. В демонстрационном режиме доступны обзор, список операций, кейсы, граф счетов и пошаговое воспроизведение.

## Запуск

Выполните из каталога `fraud-replay`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Откройте [localhost:5173](http://localhost:5173/). Демонстрационный набор загружается из проекта, поэтому для просмотра достаточно Node.js. На Linux и macOS используйте `npm`.

## Подключение внешнего API

Импорт CSV, симуляция остановки и PDF используют внешний Fraud Replay API. Для разработки создайте `.env.local` в `fraud-replay` и перезапустите Vite:

```dotenv
VITE_API_ENABLED=true
VITE_API_TARGET=http://127.0.0.1:8000
```

При публикации укажите `VITE_API_ENABLED=true` на этапе сборки и настройте хостинг так, чтобы запросы к `/api` перенаправлялись на внешний API. Формат синтетического CSV приведён в [data/demo.csv](data/demo.csv).

## Проверка

```powershell
npm.cmd run lint
npm.cmd run build
```

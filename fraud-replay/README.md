# Fraud Replay

Локальный фронтенд с вымышленными транзакциями и расследованиями. В демонстрации CSV остаётся в браузере, а результаты берутся из `src/data/demo.ts`.

## Запуск в PowerShell

Выполните из папки `fraud-replay`:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5174
```

Откройте адрес, который покажет Vite. Обычно это http://localhost:5174/.

## Сборка

```powershell
npm.cmd run build
```

Готовая сборка появится в `dist`. Для локального предпросмотра используйте `npm.cmd run preview`.

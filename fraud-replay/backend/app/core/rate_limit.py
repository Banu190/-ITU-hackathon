from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.exceptions import AppError


class InMemoryRateLimiter:
    """Small deployment limiter; use a shared gateway limiter for multi-instance production."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str, *, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        cutoff = now - window_seconds
        async with self._lock:
            events = self._events[key]
            while events and events[0] < cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(events[0] + window_seconds - now))
                raise AppError(
                    "Too many requests",
                    status_code=429,
                    code="rate_limit_exceeded",
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)


rate_limiter = InMemoryRateLimiter()


def client_key(request: Request, scope: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{scope}:{host}"

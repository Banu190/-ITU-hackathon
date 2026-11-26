export type AccessToken = { value: string; expiresAt: number };

const storageKey = "fraud-replay:access-token";
const listeners = new Set<() => void>();

function restoreAccessToken(): AccessToken | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (typeof stored?.value === "string" && stored.value && Number.isFinite(stored.expiresAt) && stored.expiresAt > Date.now()) {
      return { value: stored.value, expiresAt: stored.expiresAt };
    }
    sessionStorage.removeItem(storageKey);
  } catch { /* The session is optional when storage is unavailable. */ }
  return null;
}

let current: AccessToken | null | undefined;

export function getAccessToken() {
  if (current === undefined) current = restoreAccessToken();
  return current;
}

export function subscribeToAccessToken(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function saveAccessToken(next: AccessToken) {
  current = next;
  try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the active session in memory. */ }
  listeners.forEach((listener) => listener());
}

export function clearAccessToken(expected: string) {
  if (current?.value !== expected) return;
  current = null;
  try { sessionStorage.removeItem(storageKey); } catch { /* The session is closed in memory. */ }
  listeners.forEach((listener) => listener());
}

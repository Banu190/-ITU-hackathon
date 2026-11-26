import type { AccessToken } from "./accessToken";
import { request } from "./api";

export const roles = {
  admin: "Admin",
  analyst: "Fraud Analyst",
  viewer: "Viewer",
} as const;

export type Role = keyof typeof roles;

export type Session = {
  role: Role;
  name: string;
  email?: string;
  organization?: string;
};

function parseRole(value: unknown): Role | undefined {
  switch (value) {
    case "organization_admin": return "admin";
    case "fraud_analyst": return "analyst";
    case "read_only_viewer": return "viewer";
  }
}

export type LoginDetails = { email: string; password: string; organization_slug?: string };

export async function authenticate(details: LoginDetails): Promise<AccessToken> {
  const result = await request<{ access_token: string; token_type: string; expires_at: string }>("/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details),
  }, null);
  const expiresAt = Date.parse(result.expires_at);
  if (result.token_type !== "bearer" || !result.access_token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Сервер не выдал действующую сессию.");
  }
  return { value: result.access_token, expiresAt };
}

export async function loadSession(token: string, signal?: AbortSignal): Promise<Session> {
  const account = await request<{ role?: unknown; display_name?: unknown; email?: unknown; organization?: { name?: unknown } }>(
    "/auth/me", { signal, headers: { Accept: "application/json" } }, token,
  );
  const role = parseRole(account?.role);
  if (!role) throw new Error("Для этой учётной записи не настроена роль Fraud Replay.");
  const email = typeof account.email === "string" ? account.email : undefined;
  const name = typeof account.display_name === "string" ? account.display_name.trim() : "";
  const organization = typeof account.organization?.name === "string" ? account.organization.name : undefined;
  return { role, name: name || email || roles[role], email, organization };
}

export function revokeSession(token: string) {
  return request<void>("/auth/logout", { method: "POST", signal: AbortSignal.timeout(8_000) }, token);
}

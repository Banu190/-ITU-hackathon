import { request } from "./api";

export const roles = {
  admin: "Admin",
  analyst: "Fraud Analyst",
  viewer: "Viewer",
} as const;

export type Role = keyof typeof roles;

export type Session = {
  mode: "server" | "demo";
  role: Role;
  name: string;
  email?: string;
};

function parseRole(value: unknown): Role | undefined {
  if (typeof value !== "string") return;
  switch (value.toLowerCase().replace(/[^a-z]/g, "")) {
    case "admin": return "admin";
    case "fraudanalyst":
    case "analyst": return "analyst";
    case "viewer": return "viewer";
  }
}

export async function loadSession(signal: AbortSignal): Promise<Session> {
  const account = await request<{ role?: unknown; name?: unknown; full_name?: unknown; username?: unknown; email?: unknown }>(
    "/auth/me", { signal, headers: { Accept: "application/json" } },
  );
  const role = parseRole(account?.role);
  if (!role) throw new Error("Для этой учётной записи не настроена роль Fraud Replay.");
  const email = typeof account.email === "string" ? account.email : undefined;
  const name = [account.name, account.full_name, account.username, email].find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  );
  return { mode: "server", role, name: name ?? roles[role], email };
}

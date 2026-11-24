import {
  ArrowLeftRight, ClipboardList, FileText, LayoutDashboard, Network, Play, SearchCheck, Upload, UserRound, UsersRound,
} from "lucide-react";
import type { Role } from "./session";

export const navigation = {
  dashboard: { label: "Обзор", icon: LayoutDashboard },
  transactions: { label: "Транзакции", icon: ArrowLeftRight },
  upload: { label: "Загрузка CSV", icon: Upload },
  investigation: { label: "Расследования", icon: SearchCheck },
  graph: { label: "Граф связей", icon: Network },
  replay: { label: "Replay", icon: Play },
  reports: { label: "Отчёты", icon: FileText },
  employees: { label: "Сотрудники", icon: UsersRound },
  audit: { label: "Аудит", icon: ClipboardList },
  profile: { label: "Профиль", icon: UserRound },
};

export type Page = keyof typeof navigation;

const analystPages: readonly Page[] = ["dashboard", "transactions", "upload", "investigation", "graph", "replay", "reports"];

export const pagesByRole: Record<Role, readonly Page[]> = {
  admin: [...analystPages, "employees", "audit", "profile"],
  analyst: [...analystPages, "profile"],
  viewer: ["dashboard", "investigation", "profile"],
};

export function linkTo(page: Page, caseId?: string) {
  return `/${page}${caseId ? `/${encodeURIComponent(caseId)}` : ""}`;
}

import { API_URL } from "@/lib/chat-api";
import type { AuditEntry, Report, ReportReason, ReportStatus } from "@/lib/chat-contract";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | T | null;
  if (!response.ok) {
    const raw = payload && typeof payload === "object" && "message" in payload ? payload.message : undefined;
    throw new Error(Array.isArray(raw) ? raw[0] : raw ?? "Не удалось выполнить запрос");
  }
  return payload as T;
}

export function createReport(input: { userId?: string; messageId?: string; reason: ReportReason; details?: string }) {
  return request<Report>("/api/reports", { method: "POST", body: JSON.stringify(input) });
}

export function fetchReports(status?: ReportStatus) {
  return request<Report[]>("/api/moderation/reports" + (status ? "?status=" + status : ""));
}

export function reviewReport(reportId: string, status: Exclude<ReportStatus, "OPEN">, resolution?: string) {
  return request<Report>("/api/moderation/reports/" + encodeURIComponent(reportId), {
    method: "PATCH",
    body: JSON.stringify({ status, resolution: resolution || undefined }),
  });
}
export type ReportAction = "DELETE_MESSAGE" | "MUTE_HOUR" | "MUTE_DAY" | "CHAOS_DAY" | "BAN_DAY";

export function actOnReport(reportId: string, action: ReportAction, resolution?: string) {
  return request<Report>("/api/moderation/reports/" + encodeURIComponent(reportId) + "/actions", {
    method: "POST",
    body: JSON.stringify({ action, resolution: resolution || undefined }),
  });
}

export function fetchAudit() {
  return request<AuditEntry[]>("/api/moderation/audit");
}

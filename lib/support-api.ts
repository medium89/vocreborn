import { API_URL } from "@/lib/chat-api";
export type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; username: string; displayName: string; email: string | null };
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init, credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message[0] : message ?? "Не удалось выполнить запрос");
  }
  return payload as T;
}
export function createSupportTicket(subject: string, message: string) {
  return request<{ id: string; status: "OPEN"; createdAt: string }>("/api/support/tickets", {
    method: "POST", body: JSON.stringify({ subject, message }),
  });
}
export function fetchSupportTickets() {
  return request<SupportTicket[]>("/api/support/tickets");
}
export function reviewSupportTicket(id: string, status: "OPEN" | "RESOLVED") {
  return request<{ id: string; status: "OPEN" | "RESOLVED" }>("/api/support/tickets/" + encodeURIComponent(id), {
    method: "PATCH", body: JSON.stringify({ status }),
  });
}

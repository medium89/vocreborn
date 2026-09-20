import type { NotificationFeed } from "@/lib/chat-contract";
import { API_URL } from "@/lib/chat-api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Не удалось получить уведомления");
  }
  return response.json() as Promise<T>;
}

export function fetchNotifications() {
  return request<NotificationFeed>("/api/notifications");
}

export function markNotificationsRead() {
  return request<{ updated: number }>("/api/notifications/read", { method: "POST" });
}

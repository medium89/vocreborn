import type { NotificationFeed, NotificationItem } from "@/lib/chat-contract";
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

export function removeNotification(notificationId: string) {
  return request<{ deleted: number }>("/api/notifications/" + encodeURIComponent(notificationId), { method: "DELETE" });
}

export type NotificationHistory = { items: NotificationItem[]; total: number; page: number; pages: number; pageSize: number };

export function fetchNotificationHistory(page: number, types: NotificationItem["type"][]) {
  const params = new URLSearchParams({ page: String(page), types: types.join(",") });
  return request<NotificationHistory>("/api/notifications/history?" + params.toString());
}

export function clearAllNotifications() {
  return request<{ deleted: number }>("/api/notifications/all", { method: "DELETE" });
}

import { API_URL } from "@/lib/chat-api";

async function moderationRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init.headers } });
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | T | null;
  if (!response.ok) {
    const raw = payload && typeof payload === "object" && "message" in payload ? payload.message : undefined;
    throw new Error(Array.isArray(raw) ? raw[0] : raw ?? "Ошибка модерации");
  }
  return payload as T;
}
export function muteUser(userId: string, durationMinutes: number, reason?: string) {
  return moderationRequest<{ userId: string; mutedUntil: string }>("/api/moderation/mutes", { method: "POST", body: JSON.stringify({ userId, durationMinutes, reason: reason || undefined }) });
}
export function unmuteUser(userId: string) {
  return moderationRequest<{ userId: string; mutedUntil: null }>("/api/moderation/mutes/" + encodeURIComponent(userId), { method: "DELETE" });
}
export function imposeChaos(userId: string, durationMinutes: number, reason?: string) {
  return moderationRequest<{ userId: string; chaosUntil: string }>("/api/moderation/chaos", { method: "POST", body: JSON.stringify({ userId, durationMinutes, reason: reason || undefined }) });
}
export function removeChaos(userId: string) {
  return moderationRequest<{ userId: string; chaosUntil: null }>("/api/moderation/chaos/" + encodeURIComponent(userId), { method: "DELETE" });
}
export function banUser(userId: string, durationMinutes?: number, reason?: string) {
  return moderationRequest<{ userId: string; banned: true; expiresAt: string | null }>("/api/moderation/bans", { method: "POST", body: JSON.stringify({ userId, durationMinutes, reason: reason || undefined }) });
}
export function unbanUser(userId: string) {
  return moderationRequest<{ userId: string; banned: false }>("/api/moderation/bans/" + encodeURIComponent(userId), { method: "DELETE" });
}
export function deletePublicMessage(messageId: string) {
  return moderationRequest<{ messageId: string }>("/api/messages/" + encodeURIComponent(messageId), { method: "DELETE" });
}
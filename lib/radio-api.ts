import { API_URL } from "./chat-api";
export type RadioStatus = { enabled: boolean; live: boolean; accepting: boolean; price: number; host: { id: string; displayName: string } | null; track: { id: string; artist: string; title: string } | null; streamUrl: string | null };
export type RadioOrder = { id: string; userId: string; epoch: string; artist: string; title: string; note: string; studio: boolean; price: number; payment: "HELD" | "CHARGED" | "REFUNDED"; status: "WAITING" | "ACCEPTED" | "PLAYING" | "COMPLETED" | "REJECTED" | "CANCELLED" | "EXPIRED"; decision: string; createdAt: string; expiresAt: string; upload?: { id: string; originalName: string; duration?: number; expiresAt: string; available?: boolean } | null; user?: { id: string; displayName: string } };
export const radioLabels: Record<RadioOrder["status"], string> = { WAITING: "В очереди", ACCEPTED: "Принят DJ", PLAYING: "В эфире", COMPLETED: "Исполнен", REJECTED: "Отклонён", CANCELLED: "Отменён", EXPIRED: "Истёк срок ожидания" };
export async function radioRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(API_URL + "/api/radio" + path, { method: body === undefined ? "GET" : method, credentials: "include", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message[0] : payload.message ?? "Не удалось выполнить действие радио");
  return payload as T;
}
export const getRadioStatus = () => radioRequest<RadioStatus>("/status");
export const setRadioDj = (id: string, enabled: boolean) => radioRequest("/dj/" + encodeURIComponent(id), { enabled }, "PATCH");
export async function uploadRadioAudio(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Аудиофайл должен быть не больше 25 МБ");
  const form = new FormData(); form.append("audio", file);
  return radioRequest<{ id: string; originalName: string; expiresAt: string; duration: number }>("/uploads", form);
}

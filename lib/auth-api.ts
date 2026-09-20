import { API_URL } from "@/lib/chat-api";
import type { AuthUser } from "@/lib/chat-contract";

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
    throw new Error(message ?? "Ошибка авторизации");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getMe() {
  const result = await authRequest<{ user: AuthUser }>("/api/me");
  return result.user;
}

export async function register(input: { username: string; displayName: string; password: string }) {
  const result = await authRequest<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function login(input: { username: string; password: string }) {
  const result = await authRequest<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export function logout() {
  return authRequest<void>("/api/auth/logout", { method: "POST" });
}

export function updateProfile(input: { bio: string; gender: "male" | "female" | "unspecified" }) {
  return authRequest<{ user: AuthUser }>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((result) => result.user);
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("avatar", file);
  const response = await fetch(API_URL + "/api/me/avatar", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await response.json().catch(() => null) as { user?: AuthUser; message?: string | string[] } | null;
  if (!response.ok || !payload?.user) {
    const raw = payload?.message;
    throw new Error(Array.isArray(raw) ? raw[0] : raw ?? "Не удалось загрузить аватар");
  }
  return payload.user;
}


export async function changePassword(currentPassword: string, newPassword: string) {
  const result = await authRequest<{ user: AuthUser }>("/api/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return result.user;
}


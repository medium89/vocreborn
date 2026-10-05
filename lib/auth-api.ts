import { API_URL } from "@/lib/chat-api";
import type { AuthUser } from "@/lib/chat-contract";

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message[0]
      : payload?.message;
    throw new Error(message ?? "Ошибка авторизации");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getMe() {
  const result = await authRequest<{ user: AuthUser }>("/api/me");
  return result.user;
}

export async function register(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  const result = await authRequest<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function enterAsGuest(turnstileToken: string) {
  const result = await authRequest<{ user: AuthUser }>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify({ turnstileToken }),
  });
  return result.user;
}

export async function upgradeGuest(input: {
  email: string;
  displayName: string;
  password: string;
}) {
  const result = await authRequest<{ user: AuthUser }>(
    "/api/auth/guest/upgrade",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return result.user;
}

export async function login(input: {
  email?: string;
  username?: string;
  password: string;
}) {
  const result = await authRequest<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export function logout() {
  return authRequest<void>("/api/auth/logout", { method: "POST" });
}

export function updateProfile(input: {
  bio: string;
  gender: "male" | "female" | "unspecified";
  hideRole?: boolean;
}) {
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
  const payload = (await response.json().catch(() => null)) as {
    user?: AuthUser;
    message?: string | string[];
  } | null;
  if (!response.ok || !payload?.user) {
    const raw = payload?.message;
    throw new Error(
      Array.isArray(raw) ? raw[0] : (raw ?? "Не удалось загрузить аватар"),
    );
  }
  return payload.user;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const result = await authRequest<{ user: AuthUser }>("/api/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return result.user;
}

export async function createRecoveryCode(currentPassword: string) {
  return authRequest<{ code: string; expiresAt: string }>(
    "/api/me/recovery-code",
    {
      method: "POST",
      body: JSON.stringify({ currentPassword }),
    },
  );
}

export async function resetPassword(code: string, newPassword: string) {
  return authRequest<{ ok: boolean }>("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ code, newPassword }),
  });
}

export function requestEmailPasswordReset(email: string) {
  return authRequest<{ ok: boolean }>("/api/auth/password/email/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPasswordByEmail(token: string, newPassword: string) {
  return authRequest<{ ok: boolean }>("/api/auth/password/email/reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export function verifyEmail(token: string) {
  return authRequest<{ ok: boolean }>("/api/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function setAccountEmail(email: string, currentPassword: string) {
  return authRequest<{ ok: boolean; alreadyVerified: boolean }>(
    "/api/me/email",
    { method: "POST", body: JSON.stringify({ email, currentPassword }) },
  );
}

export function resendEmailVerification() {
  return authRequest<{ ok: boolean }>("/api/me/email/resend", {
    method: "POST",
  });
}

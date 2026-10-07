import { API_URL } from "@/lib/chat-api";
import type { Gender, UserRole, UserStatus } from "@/lib/chat-contract";

export type EditableUser = {
  id: string; username: string; displayName: string; bio: string | null; gender: Gender;
  isDj: boolean;
  cosmetics: Array<{ effectKey: string; settings: Record<string, unknown> }>;
  role: UserRole; hideRole: boolean; hideDj: boolean; participantBadge: string; status: UserStatus; rating: number; credits: number;
  avatarUrl: string | null; isGuest: boolean; isBot: boolean; createdAt: string; updatedAt: string;
  _count: { messages: number; profilePosts: number; reportsReceived: number };
};
export type EditableUserChanges = Partial<Pick<EditableUser, "username" | "displayName" | "bio" | "gender" | "role" | "hideRole" | "hideDj" | "participantBadge" | "rating" | "credits">>;

async function request<T>(id: string, suffix = "", init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + "/api/admin/users/" + encodeURIComponent(id) + suffix, {
    ...init, credentials: "include",
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null) as T | { message?: string | string[] } | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload ? payload.message : undefined;
    throw new Error(Array.isArray(message) ? message[0] : message ?? "Не удалось выполнить действие");
  }
  return payload as T;
}
export const fetchEditableUser = (id: string) => request<EditableUser>(id);
export const updateEditableUser = (id: string, changes: EditableUserChanges) => request<EditableUser>(id, "", {
  method: "PATCH", body: JSON.stringify({
    ...changes, gender: changes.gender?.toUpperCase(), role: changes.role?.toUpperCase(),
  }),
});
export const deactivateEditableUser = (id: string) => request<{ id: string; deactivated: true }>(id, "", { method: "DELETE" });
export const removeEditableUserAvatar = (id: string) => request<EditableUser>(id, "/avatar", { method: "DELETE" });
export function uploadEditableUserAvatar(id: string, file: File) {
  const data = new FormData();
  data.append("avatar", file);
  return request<EditableUser>(id, "/avatar", { method: "POST", body: data });
}

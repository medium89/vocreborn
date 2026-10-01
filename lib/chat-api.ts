import type { DirectConversation, Message, Person, ReactionType, ReactionUpdate, Room, RoomResources } from "@/lib/chat-contract";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "API request failed: " + response.status);
  }

  return response.json() as Promise<T>;
}

export function fetchRooms() {
  return request<Room[]>("/api/rooms");
}

export function fetchRoomResources(roomId: string) {
  return request<RoomResources>("/api/rooms/" + encodeURIComponent(roomId) + "/resources");
}

export function fetchRoomMessagePage(roomId: string, cursor?: string) {
  const query = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
  return request<{ items: Message[]; nextCursor: string | null }>("/api/rooms/" + encodeURIComponent(roomId) + "/messages" + query);
}

export async function fetchRoomMessages(roomId: string) {
  return (await fetchRoomMessagePage(roomId)).items;
}

export function postRoomMessage(roomId: string, body: string, requestId: string, attachmentId?: string, replyToId?: string, adminVoice?: boolean) {
  return request<{ requestId: string; message: Message }>("/api/rooms/" + encodeURIComponent(roomId) + "/messages", {
    method: "POST",
    body: JSON.stringify({ body, requestId, attachmentId, replyToId, adminVoice }),
  });
}

export function fetchUsers() {
  return request<Person[]>("/api/users");
}

export function fetchDirectMessagePage(peerId: string, cursor?: string) {
  const query = cursor ? "?cursor=" + encodeURIComponent(cursor) : "";
  return request<{ items: Message[]; nextCursor: string | null }>("/api/direct/" + encodeURIComponent(peerId) + "/messages" + query);
}

export async function fetchDirectMessages(peerId: string) {
  return (await fetchDirectMessagePage(peerId)).items;
}

export function postDirectMessage(peerId: string, body: string, requestId: string, attachmentId?: string, replyToId?: string) {
  return request<{ requestId: string; message: Message }>("/api/direct/" + encodeURIComponent(peerId) + "/messages", {
    method: "POST",
    body: JSON.stringify({ body, requestId, attachmentId, replyToId }),
  });
}
export function fetchDirectConversations() {
  return request<DirectConversation[]>("/api/direct");
}

export function fetchDirectResources() {
  return request<RoomResources>("/api/direct/resources");
}

export function markDirectRead(peerId: string) {
  return request<{ updated: number }>("/api/direct/" + encodeURIComponent(peerId) + "/read", {
    method: "POST",
  });
}
export function createRoom(input: { name: string; description: string; tone: string; coverEmoji: string; rules: string; visibility: "public" | "private" }) {
  return request<Room>("/api/rooms", { method: "POST", body: JSON.stringify(input) });
}

export function updateRoom(roomId: string, input: { name: string; description: string; tone: string; coverEmoji: string; rules: string; visibility: "public" | "private" }) {
  return request<Room>("/api/rooms/" + encodeURIComponent(roomId), { method: "PATCH", body: JSON.stringify(input) });
}

export async function uploadRoomCover(roomId: string, file: File) {
  const form = new FormData();
  form.set("cover", file);
  const response = await fetch(API_URL + "/api/rooms/" + encodeURIComponent(roomId) + "/cover", { method: "POST", credentials: "include", body: form });
  if (!response.ok) throw new Error((await response.text()) || "Не удалось загрузить обложку");
  return response.json() as Promise<Room>;
}

export function leaveRoom(roomId: string) {
  return request<{ roomId: string; joined: false }>("/api/rooms/" + encodeURIComponent(roomId) + "/members/me", { method: "DELETE" });
}

export function toggleMessageReaction(messageId: string, type: ReactionType) {
  return request<ReactionUpdate>("/api/messages/" + encodeURIComponent(messageId) + "/reaction", {
    method: "PUT",
    body: JSON.stringify({ type: type.toUpperCase() }),
  });
}

export function searchRoomMessages(roomId: string, query: string) {
  return request<Message[]>("/api/rooms/" + encodeURIComponent(roomId) + "/search?q=" + encodeURIComponent(query));
}

export function fetchRoomMessage(roomId: string, messageId: string) {
  return request<Message>("/api/rooms/" + encodeURIComponent(roomId) + "/messages/" + encodeURIComponent(messageId));
}

export function searchDirectMessages(peerId: string, query: string) {
  return request<Message[]>("/api/direct/" + encodeURIComponent(peerId) + "/search?q=" + encodeURIComponent(query));
}

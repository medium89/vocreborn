import { API_URL } from "@/lib/chat-api";

export type AlbumPhoto = { id: string; originalName: string; url: string; thumbnailUrl: string; size: number; createdAt: string };
export type PhotoAlbum = { id: string; title: string; createdAt: string; photos: AlbumPhoto[] };

type ApiError = { message?: string | string[] };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, { ...init, credentials: "include", headers: { ...init?.headers } });
  if (!response.ok) { const payload = await response.json().catch(() => null) as ApiError | null; const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message; throw new Error(message ?? "Не удалось выполнить действие"); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function getPhotoAlbums() { return (await request<{ albums: PhotoAlbum[] }>("/api/me/albums")).albums; }
export async function createPhotoAlbum(title: string) { return (await request<{ album: PhotoAlbum }>("/api/me/albums", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) })).album; }
export function deletePhotoAlbum(albumId: string) { return request<void>("/api/me/albums/" + encodeURIComponent(albumId), { method: "DELETE" }); }
export async function uploadAlbumPhoto(albumId: string, file: File) { const form = new FormData(); form.append("photo", file); return (await request<{ photo: AlbumPhoto }>("/api/me/albums/" + encodeURIComponent(albumId) + "/photos", { method: "POST", body: form })).photo; }
export async function toggleAlbumPhotoLike(photoId: string) { return request<{ liked: boolean }>("/api/me/albums/photos/" + encodeURIComponent(photoId) + "/like", { method: "POST" }); }
export async function commentAlbumPhoto(photoId: string, body: string) { return request<{ id: string; body: string; createdAt: string }>("/api/me/albums/photos/" + encodeURIComponent(photoId) + "/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }); }
export function deleteAlbumPhoto(albumId: string, photoId: string) { return request<void>("/api/me/albums/" + encodeURIComponent(albumId) + "/photos/" + encodeURIComponent(photoId), { method: "DELETE" }); }
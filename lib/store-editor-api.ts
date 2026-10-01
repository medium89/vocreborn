import { API_URL } from "@/lib/chat-api";
import type { StoreCategory } from "@/lib/chat-contract";

export type StoreProduct = {
  id: string; categoryId: string; name: string; description: string; emoji: string;
  kind: "gift" | "cosmetic"; effectKey: string | null; imageKey: string | null; imageUrl: string | null;
  price: number; active: boolean; position: number; createdAt: string;
};
export type StoreCategoryInput = Pick<StoreCategory, "name" | "description" | "icon" | "active" | "position">;
export type StoreProductInput = Pick<StoreProduct, "categoryId" | "name" | "description" | "emoji" | "kind" | "effectKey" | "imageKey" | "price" | "active" | "position">;
export type StoreEditorCatalog = { categories: StoreCategory[]; products: StoreProduct[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + "/api/admin/store" + path, {
    ...init, credentials: "include",
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null) as T | { message?: string | string[] } | null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload ? payload.message : undefined;
    throw new Error(Array.isArray(message) ? message[0] : message ?? "Не удалось изменить магазин");
  }
  return payload as T;
}
export const fetchStoreEditorCatalog = () => request<StoreEditorCatalog>("");
export const createStoreCategory = (input: StoreCategoryInput) => request<StoreCategory>("/categories", { method: "POST", body: JSON.stringify(input) });
export const updateStoreCategory = (id: string, input: StoreCategoryInput) => request<StoreCategory>("/categories/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(input) });
export const deleteStoreCategory = (id: string) => request<{ id: string; deleted: true }>("/categories/" + encodeURIComponent(id), { method: "DELETE" });
export const createStoreProduct = (input: StoreProductInput) => request<StoreProduct>("/products", { method: "POST", body: JSON.stringify(input) });
export const updateStoreProduct = (id: string, input: StoreProductInput) => request<StoreProduct>("/products/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(input) });
export const deleteStoreProduct = (id: string) => request<{ id: string; deleted: true }>("/products/" + encodeURIComponent(id), { method: "DELETE" });
export const deleteStoreCategoryImage = (id: string) => request<StoreCategory>("/categories/" + encodeURIComponent(id) + "/image", { method: "DELETE" });
export function uploadStoreCategoryImage(id: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  return request<StoreCategory>("/categories/" + encodeURIComponent(id) + "/image", { method: "POST", body: form });
}

export type StoreBulkProductInput = { name: string; description: string; price: number };
export function uploadStoreProductImage(id: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  return request<StoreProduct>("/products/" + encodeURIComponent(id) + "/image", { method: "POST", body: form });
}
export function bulkCreateStoreProducts(categoryId: string, products: StoreBulkProductInput[], files: File[]) {
  const form = new FormData();
  form.append("categoryId", categoryId);
  form.append("products", JSON.stringify(products));
  files.forEach((file) => form.append("images", file));
  return request<StoreProduct[]>("/products/bulk", { method: "POST", body: form });
}

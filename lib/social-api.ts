import { API_URL } from "@/lib/chat-api";
import type { AdminOverview, AdminUser, Attachment, Community, CommunityDetail, CommunityMembershipStatus, CommunityPost, CommunityRequest, EconomyBalance, GiftCatalogItem, GiftInventoryItem, PendingAttachment, ProfilePost, PublicProfile, UserRole } from "@/lib/chat-contract";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const value = payload?.message;
    throw new Error(Array.isArray(value) ? value[0] : value ?? "Запрос не выполнен");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadAttachment(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(API_URL + "/api/attachments", { method: "POST", credentials: "include", body: form });
  const payload = await response.json().catch(() => null) as (Attachment & { message?: string | string[] }) | null;
  if (!response.ok || !payload?.id) {
    const value = payload?.message;
    throw new Error(Array.isArray(value) ? value[0] : value ?? "Не удалось загрузить вложение");
  }
  return payload;
}

export function fetchPublicProfile(userId: string) {
  return request<PublicProfile>("/api/users/" + encodeURIComponent(userId));
}
export function fetchProfilePosts(userId: string) {
  return request<ProfilePost[]>("/api/users/" + encodeURIComponent(userId) + "/profile-posts");
}
export function createProfilePost(userId: string, body: string, parentId?: string, attachmentId?: string) {
  return request<ProfilePost>("/api/users/" + encodeURIComponent(userId) + "/profile-posts", { method: "POST", body: JSON.stringify({ body, parentId, attachmentId }) });
}
export function deleteProfilePost(id: string) {
  return request<{ id: string }>("/api/profile-posts/" + encodeURIComponent(id), { method: "DELETE" });
}

export function fetchAdminOverview() {
  return request<AdminOverview>("/api/admin/overview");
}
export function fetchAdminUsers() {
  return request<AdminUser[]>("/api/admin/users");
}
export function setAdminUserRole(id: string, role: UserRole) {
  return request<{ id: string; role: UserRole }>("/api/admin/users/" + encodeURIComponent(id) + "/role", { method: "PATCH", body: JSON.stringify({ role: role.toUpperCase() }) });
}
export function deactivateAdminUser(id: string) {
  return request<{ id: string; deactivated: true }>("/api/admin/users/" + encodeURIComponent(id), { method: "DELETE" });
}
export function fetchPendingAttachments() {
  return request<PendingAttachment[]>("/api/attachments/pending");
}
export function reviewAttachment(id: string, status: "APPROVED" | "REJECTED") {
  return request<Attachment>("/api/attachments/" + encodeURIComponent(id) + "/review", { method: "PATCH", body: JSON.stringify({ status }) });
}

export function fetchCommunities(){return request<Community[]>("/api/communities");}export function fetchCommunity(id:string){return request<CommunityDetail>("/api/communities/"+encodeURIComponent(id));}export function createCommunity(input:{name:string;description:string;joinPolicy:"open"|"approval"}){return request<Community>("/api/communities",{method:"POST",body:JSON.stringify(input)});}export function updateCommunity(id:string,input:{name:string;description:string;joinPolicy:"open"|"approval"}){return request<Community>("/api/communities/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(input)});}export function joinCommunity(id:string){return request<{status:CommunityMembershipStatus}>("/api/communities/"+encodeURIComponent(id)+"/join",{method:"POST"});}export function fetchCommunityRequests(id:string){return request<CommunityRequest[]>("/api/communities/"+encodeURIComponent(id)+"/requests");}export function decideCommunityRequest(id:string,userId:string,decision:"approve"|"reject"){return request("/api/communities/"+encodeURIComponent(id)+"/requests/"+encodeURIComponent(userId),{method:"PATCH",body:JSON.stringify({decision})});}export function setCommunityMemberRole(id:string,userId:string,role:"moderator"|"member"){return request("/api/communities/"+encodeURIComponent(id)+"/members/"+encodeURIComponent(userId),{method:"PATCH",body:JSON.stringify({role})});}export function createCommunityPost(id:string,body:string){return request<CommunityPost>("/api/communities/"+encodeURIComponent(id)+"/posts",{method:"POST",body:JSON.stringify({body})});}export function deleteCommunityPost(id:string,postId:string){return request("/api/communities/"+encodeURIComponent(id)+"/posts/"+encodeURIComponent(postId),{method:"DELETE"});}

export function fetchGiftCatalog(){return request<GiftCatalogItem[]>("/api/gifts");}export function fetchMyGifts(){return request<GiftInventoryItem[]>("/api/gifts/me");}export function fetchEconomyBalance(){return request<EconomyBalance>("/api/gifts/balance");}export function sendGift(id:string,recipientId?:string,message?:string){return request<{id:string;recipient:{id:string;displayName:string};balance:EconomyBalance}>("/api/gifts/"+encodeURIComponent(id)+"/send",{method:"POST",body:JSON.stringify({recipientId,message})});}

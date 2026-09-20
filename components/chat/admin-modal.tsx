"use client";

import { useEffect, useState } from "react";
import { Check, DoorOpen, FileAudio, FileImage, Flag, LayoutGrid, RefreshCw, Shield, Trash2, Users, X } from "lucide-react";
import { API_URL } from "@/lib/chat-api";
import type { AdminOverview, AdminUser, PendingAttachment, UserRole } from "@/lib/chat-contract";
import { deactivateAdminUser, fetchAdminOverview, fetchAdminUsers, fetchPendingAttachments, reviewAttachment, setAdminUserRole } from "@/lib/social-api";

const roleLabels: Record<UserRole, string> = { user: "Участник", moderator: "Модератор", admin: "Администратор" };

export function AdminModal({ onOpenRooms, onOpenReports, onClose }: { onOpenRooms: () => void; onOpenReports: () => void; onClose: () => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [tab, setTab] = useState<"users" | "attachments">("users");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [nextOverview, nextUsers, nextAttachments] = await Promise.all([fetchAdminOverview(), fetchAdminUsers(), fetchPendingAttachments()]);
      setOverview(nextOverview); setUsers(nextUsers); setAttachments(nextAttachments);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить управление"); }
  }
  useEffect(() => { void load(); }, []);

  async function changeRole(id: string, role: UserRole) {
    try { await setAdminUserRole(id, role); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить роль"); }
  }
  async function deactivate(user: AdminUser) {
    if (!window.confirm("Отключить аккаунт @" + user.username + "? Все его сеансы будут завершены.")) return;
    try { await deactivateAdminUser(user.id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отключить аккаунт"); }
  }
  async function review(id: string, status: "APPROVED" | "REJECTED") {
    try { await reviewAttachment(id, status); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось проверить вложение"); }
  }

  const cards = overview ? [
    ["Пользователи", overview.users], ["Комнаты", overview.rooms], ["Сообщения", overview.messages],
    ["Открытые жалобы", overview.openReports], ["Вложения на проверке", overview.pendingAttachments], ["Сообщения профилей", overview.profilePosts],
  ] as const : [];

  return <div className="modal-backdrop" onClick={onClose}><div className="modal admin-modal" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
    <h2>Панель администратора</h2>
    <div className="admin-stats">{cards.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
    <div className="admin-shortcuts"><button onClick={onOpenRooms}><LayoutGrid size={15} />Комнаты</button><button onClick={onOpenReports}><Flag size={15} />Жалобы и журнал</button><button onClick={() => void load()}><RefreshCw size={15} />Обновить</button></div>
    <div className="auth-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={14} />Пользователи</button><button className={tab === "attachments" ? "active" : ""} onClick={() => setTab("attachments")}><Shield size={14} />Вложения <b>{attachments.length}</b></button></div>
    {error && <div className="auth-error">{error}</div>}
    {tab === "users" ? <div className="admin-users">{users.map((user) => <article key={user.id}><div><strong>{user.displayName}</strong><small>@{user.username} · сообщений: {user._count.messages} · жалоб: {user._count.reportsReceived}</small></div><select aria-label={"Роль " + user.displayName} value={user.role} onChange={(event) => void changeRole(user.id, event.target.value as UserRole)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button className="danger-icon" aria-label={"Отключить " + user.displayName} title="Отключить аккаунт" onClick={() => void deactivate(user)}><Trash2 size={15} /></button></article>)}</div>
    : <div className="admin-attachments">{attachments.length === 0 ? <p className="direct-empty">Все вложения проверены.</p> : attachments.map((item) => { const Icon = item.kind === "image" ? FileImage : FileAudio; return <article key={item.id}><Icon size={18} /><div><strong>{item.originalName}</strong><small>{item.uploader.displayName} · {(item.size / 1024).toFixed(0)} КБ · {item.mimeType}</small></div><a href={API_URL + item.url} target="_blank" rel="noreferrer">Открыть</a><button className="approve" title="Разрешить" onClick={() => void review(item.id, "APPROVED")}><Check size={15} /></button><button className="danger-icon" title="Отклонить" onClick={() => void review(item.id, "REJECTED")}><X size={15} /></button></article>; })}</div>}
  </div></div>;
}

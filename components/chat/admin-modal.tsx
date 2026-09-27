"use client";

import { useEffect, useState } from "react";
import { StyledSelect } from "./styled-select";
import { Check, FileAudio, FileImage, Flag, LayoutGrid, RefreshCw, Search, Shield, Trash2, Users, X } from "lucide-react";
import { API_URL } from "@/lib/chat-api";
import { BackToChatButton } from "./back-to-chat-button";
import { SupportTicketsPanel } from "./support-tickets-panel";
import type { AdminOverview, AdminUser, PendingAttachment, UserRole } from "@/lib/chat-contract";
import { deactivateAdminUser, fetchAdminOverview, fetchAdminUsers, fetchPendingAttachments, reviewAttachment, setAdminUserRole } from "@/lib/social-api";

const roleLabels: Record<UserRole, string> = { user: "Участник", moderator: "Модератор", admin: "Администратор" };

export function AdminModal({ onOpenRooms, onOpenReports, onBackToChat }: { onOpenRooms: () => void; onOpenReports: () => void; onBackToChat: () => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [tab, setTab] = useState<"users" | "attachments">("users");
  const [search, setSearch] = useState("");
  const [usersRefresh, setUsersRefresh] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const [nextOverview, nextAttachments] = await Promise.all([fetchAdminOverview(), fetchPendingAttachments()]);
      setOverview(nextOverview); setAttachments(nextAttachments);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить управление"); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    const timer = window.setTimeout(() => {
      void fetchAdminUsers(search).then((nextUsers) => {
        if (!cancelled) { setUsers(nextUsers); setUsersLoading(false); }
      }).catch((reason) => {
        if (!cancelled) { setError(reason instanceof Error ? reason.message : "Не удалось найти пользователей"); setUsersLoading(false); }
      });
    }, search.trim() ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, usersRefresh]);

  async function changeRole(id: string, role: UserRole) {
    try { await setAdminUserRole(id, role); setUsersRefresh((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить роль"); }
  }
  async function deactivate(user: AdminUser) {
    if (!window.confirm("Отключить аккаунт @" + user.username + "? Все его сеансы будут завершены.")) return;
    try { await deactivateAdminUser(user.id); await load(); setUsersRefresh((value) => value + 1); }
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

  return <section className="management-module admin-module">
    <header className="management-module-head"><div className="page-heading"><span className="page-heading-icon"><LayoutGrid size={19} /></span><div className="page-heading-copy"><span className="eyebrow">НАСТРОЙКИ ЧАТА</span><h2>Управление</h2></div></div><BackToChatButton onClick={onBackToChat} /></header>
    <div className="management-module-body">
    <div className="admin-stats">{cards.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
    <div className="admin-shortcuts"><button onClick={onOpenRooms}><LayoutGrid size={15} />Комнаты</button><button onClick={onOpenReports}><Flag size={15} />Жалобы и журнал</button><button onClick={() => { void load(); setUsersRefresh((value) => value + 1); }}><RefreshCw size={15} />Обновить</button></div>

    <div className="auth-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={14} />Пользователи</button><button className={tab === "attachments" ? "active" : ""} onClick={() => setTab("attachments")}><Shield size={14} />Вложения <b>{attachments.length}</b></button></div>
    {error && <div className="auth-error">{error}</div>}
    {tab === "users" ? <div className="admin-users-section">
      <label className="admin-user-search"><Search size={17} aria-hidden /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по нику или имени во всей базе" aria-label="Поиск пользователей" /></label>
      <p className="admin-users-caption">{search.trim() ? "Результаты поиска по всем пользователям" : "Сейчас в чате: онлайн, отошли и не беспокоить"}</p>
      <div className="admin-users">{usersLoading ? <p className="direct-empty">Ищем пользователей…</p> : users.length === 0 ? <p className="direct-empty">{search.trim() ? "Ничего не найдено." : "Сейчас никого нет в чате."}</p> : users.map((user) => <article key={user.id}><div><strong>{user.displayName}</strong><small>@{user.username} · {user.status === "offline" ? "не в сети" : "в сети"} · сообщений: {user._count.messages} · жалоб: {user._count.reportsReceived}</small></div><StyledSelect aria-label={"Роль " + user.displayName} value={user.role} onChange={(event) => void changeRole(user.id, event.target.value as UserRole)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</StyledSelect><button className="danger-icon" aria-label={"Отключить " + user.displayName} title="Отключить аккаунт" onClick={() => void deactivate(user)}><Trash2 size={15} /></button></article>)}</div>
    </div>
    : <div className="admin-attachments">{attachments.length === 0 ? <p className="direct-empty">Все вложения проверены.</p> : attachments.map((item) => { const Icon = item.kind === "image" ? FileImage : FileAudio; return <article key={item.id}><Icon size={18} /><div><strong>{item.originalName}</strong><small>{item.uploader.displayName} · {(item.size / 1024).toFixed(0)} КБ · {item.mimeType}</small></div><a href={API_URL + item.url} target="_blank" rel="noreferrer">Открыть</a><button className="approve" title="Разрешить" onClick={() => void review(item.id, "APPROVED")}><Check size={15} /></button><button className="danger-icon" title="Отклонить" onClick={() => void review(item.id, "REJECTED")}><X size={15} /></button></article>; })}</div>}
    </div>
  </section>;
}

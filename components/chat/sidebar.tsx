"use client";

import { useEffect, useState } from "react";
import type { AuthUser } from "@/lib/chat-contract";
import { Bell, BellOff, ChevronLeft, ChevronRight, CircleDot, CircleHelp, Gift, LayoutDashboard, LogOut, MessageCircle, MessagesSquare, Moon, Settings, ShieldCheck, Sun, UsersRound } from "lucide-react";
import { Avatar } from "./avatar";

type SidebarProps = {
  user: AuthUser | null;
  unreadDirects: number;
  unreadNotifications: number;
  directActive: boolean;
  onOpenProfile: () => void;
  onSetStatus: (status: "online" | "dnd") => void;
  onLogout: () => void;
  onOpenChat: () => void;
  onOpenDirects: () => void;
  onOpenNotifications: () => void;
  onOpenRooms: () => void;
  onOpenCommunities: () => void;
  onOpenGifts: () => void;
  onOpenReports: () => void;
  onOpenAdmin: () => void;
  onNotice: (message: string) => void;
};

export function Sidebar({ user, unreadDirects, unreadNotifications, directActive, onOpenProfile, onSetStatus, onLogout, onOpenChat, onOpenDirects, onOpenNotifications, onOpenRooms, onOpenCommunities, onOpenGifts, onOpenReports, onOpenAdmin, onNotice }: SidebarProps) {
  const name = user?.displayName ?? "Гость";
  const canModerate = user?.role === "admin" || user?.role === "moderator";
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(window.localStorage.getItem("aura-sidebar-collapsed") === "true"); }, []);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = window.localStorage.getItem("aura-theme") === "dark" ? "dark" : "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem("aura-theme", next);
  }
  function toggleCollapsed() { setCollapsed((current) => { const next = !current; window.localStorage.setItem("aura-sidebar-collapsed", String(next)); return next; }); }
  return <aside className={"rail " + (collapsed ? "collapsed" : "")}>
    <div className="brand"><span className="brand-mark logo-mark"><img src="/brand/aura-logo.png" alt="" /></span><span>AURA</span><button className="rail-collapse" type="button" aria-label={collapsed ? "Развернуть боковое меню" : "Свернуть боковое меню"} title={collapsed ? "Развернуть меню" : "Свернуть меню"} onClick={toggleCollapsed}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
    <button className="me" onClick={onOpenProfile} aria-label="Открыть профиль"><Avatar value={user?.avatarUrl} name={name} className="admin" /><span><strong>{name}</strong><small>{user ? "в сети" : "вход не выполнен"}</small></span><Settings className="dots" size={16} /></button>
    {user && <div className="profile-quick-actions" aria-label="Быстрые действия профиля"><button type="button" className={"profile-quick-action online " + (user.status === "online" ? "selected" : "")} aria-label="В сети" title="В сети" onClick={() => onSetStatus("online")}><CircleDot size={16} /><span>В сети</span></button><button type="button" className={"profile-quick-action dnd " + (user.status === "dnd" ? "selected" : "")} aria-label="Не беспокоить" title="Не беспокоить" onClick={() => onSetStatus("dnd")}><BellOff size={16} /><span>Не беспокоить</span></button><button type="button" className="profile-quick-action logout" aria-label="Выйти из профиля" title="Выйти" onClick={onLogout}><LogOut size={16} /><span>Выйти</span></button></div>}
    <nav className="rail-nav">
      <button className={"rail-link " + (directActive ? "" : "active")} onClick={onOpenChat}><MessageCircle size={18} /><span>Чат</span></button>
      <button className={"rail-link " + (directActive ? "active" : "")} onClick={user ? onOpenDirects : () => onNotice("Войдите, чтобы открыть личку.")}><MessagesSquare size={18} /><span>Личка</span>{unreadDirects > 0 && <b className="direct-unread-count">{unreadDirects > 99 ? "99+" : unreadDirects}</b>}</button>
      <button className="rail-link" onClick={user ? onOpenNotifications : () => onNotice("Войдите, чтобы открыть уведомления.")}><Bell size={18} /><span>Уведомления</span>{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}</button>
      <button className="rail-link" onClick={onOpenCommunities}><UsersRound size={18} /><span>Сообщества</span></button>
      <button className="rail-link" onClick={onOpenGifts}><Gift size={18} /><span>Подарки</span></button>
      {canModerate && <section className="rail-admin" aria-label="Административные функции"><span>УПРАВЛЕНИЕ</span><button className="rail-link" onClick={onOpenReports}><ShieldCheck size={18} /><span>Модерация</span></button>{user?.role === "admin" && <button className="rail-link" onClick={onOpenAdmin}><LayoutDashboard size={18} /><span>Управление</span></button>}</section>}
    </nav>
    <div className="rail-bottom"><button className="icon-button" aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"} title={theme === "light" ? "Тёмная тема" : "Светлая тема"} onClick={toggleTheme}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button><button className="icon-button" aria-label="Справка" title="Справка" onClick={() => onNotice("Справка по первой версии появится позже.")}><CircleHelp size={17} /></button></div>
  </aside>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/lib/chat-contract";
import { Bell, BellOff, ChevronLeft, ChevronRight, CircleDot, Coins, DoorOpen, Ellipsis, Gift, Headphones, LayoutDashboard, LogOut, MessageCircle, MessagesSquare, Settings, ShieldCheck, UserRound, UserRoundSearch, UsersRound } from "lucide-react";
import { Avatar } from "./avatar";


type SidebarProps = {
  user: AuthUser | null;
  unreadDirects: number;
  unreadNotifications: number;
  unreadChatMessages: number;
  activeSection: "profile" | "chat" | "directs" | "notifications" | "community-chat" | "communities" | "store" | "reports" | "admin" | "radio";
  onOpenProfile: () => void;
  onOpenRegistration: () => void;
  onSetStatus: (status: "online" | "dnd") => void;
  onLogout: () => void;
  onOpenChat: () => void;
  onOpenDirects: () => void;
  onOpenNotifications: () => void;
  onOpenRooms: () => void;
  onOpenCommunities: () => void;
  onOpenPeople: () => void;
  communityChatName: string | null;
  onOpenCommunityChat: () => void;
  onOpenGifts: () => void;
  communityBadge: number;
  shopBadge: number;
  onOpenReports: () => void;
  onOpenAdmin: () => void;
  onOpenRadio: () => void;
  onNotice: (message: string) => void;
};

function CreditBalance({ credits, mobile = false, onOpenStore }: { credits: number; mobile?: boolean; onOpenStore: () => void }) {
  const [displayed, setDisplayed] = useState(credits);
  const [change, setChange] = useState<{ id: number; delta: number } | null>(null);
  const previous = useRef(credits);
  const displayedRef = useRef(credits);
  const changeId = useRef(0);

  useEffect(() => {
    const before = previous.current;
    if (before === credits) return;
    previous.current = credits;
    const delta = credits - before;
    const id = ++changeId.current;
    setChange({ id, delta });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = displayedRef.current;
    let frame = 0;
    if (reducedMotion) {
      displayedRef.current = credits;
      setDisplayed(credits);
    } else {
      const started = performance.now();
      const duration = Math.min(1000, 520 + Math.abs(delta) * 18);
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(start + (credits - start) * eased);
        displayedRef.current = value;
        setDisplayed(value);
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }
    const timer = window.setTimeout(() => setChange((current) => current?.id === id ? null : current), 1600);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [credits]);

  return <button type="button" onClick={onOpenStore} aria-label={"Открыть магазин. Кредиты: " + credits.toLocaleString("ru-RU")} className={"rail-credits" + (mobile ? " rail-credits-mobile" : "") + (change ? change.delta > 0 ? " is-gaining" : " is-spending" : "")} title={"Кредиты: " + credits.toLocaleString("ru-RU")}>
    <span className="rail-credits-icon" aria-hidden="true"><Coins size={19} /></span>
    <span className="rail-credits-copy"><small>Кредиты</small><strong aria-hidden="true">{displayed.toLocaleString("ru-RU")}</strong></span>
    {change && <span key={change.id} className="rail-credits-delta" aria-hidden="true">{change.delta > 0 ? "+" : "−"}{Math.abs(change.delta).toLocaleString("ru-RU")}</span>}
    <ChevronRight className="rail-credits-arrow" size={15} aria-hidden="true" />
    <span className="visually-hidden" aria-live="polite">Кредиты: {credits.toLocaleString("ru-RU")}</span>
  </button>;
}

export function Sidebar({ user, unreadDirects, unreadNotifications, unreadChatMessages, communityBadge, shopBadge, activeSection, onOpenProfile, onOpenRegistration, onSetStatus, onLogout, onOpenChat, onOpenDirects, onOpenNotifications, onOpenRooms, communityChatName, onOpenCommunityChat, onOpenCommunities, onOpenPeople, onOpenGifts, onOpenReports, onOpenAdmin, onOpenRadio, onNotice }: SidebarProps) {
  const name = user?.displayName ?? "Гость";
  const canModerate = user?.role === "admin" || user?.role === "moderator";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const logoutDialogRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { const key = "tusova-sidebar-collapsed"; const legacyKey = "aura-sidebar-collapsed"; const saved = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey); setCollapsed(saved === "true"); if (saved !== null) window.localStorage.setItem(key, saved); window.localStorage.removeItem(legacyKey); }, []);
  useEffect(() => { setMobileMoreOpen(false); }, [activeSection]);
  function runMobile(action: () => void) { setMobileMoreOpen(false); action(); }
  function toggleCollapsed() { setCollapsed((current) => { const next = !current; window.localStorage.setItem("tusova-sidebar-collapsed", String(next)); return next; }); }
  return <aside className={"rail " + (collapsed ? "collapsed" : "")}>
    <div className="brand"><span className="tusova-rail-brand"><img className="tusova-rail-wordmark" src="/brand/tusova-chat-logo.png" alt="TUSOVA" /><img className="tusova-rail-owl" src="/brand/tusova-note-owl.png" alt="TUSOVA" /></span><button className="rail-collapse" type="button" aria-label={collapsed ? "Развернуть боковое меню" : "Свернуть боковое меню"} aria-expanded={!collapsed} title={collapsed ? "Развернуть меню" : "Свернуть меню"} onClick={toggleCollapsed}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button></div>
    <section className="rail-account" aria-label="Ваш профиль">
      <div className="rail-account-head">
        <button type="button" className="rail-account-profile" onClick={onOpenProfile} aria-label="Открыть профиль" aria-current={activeSection === "profile" ? "page" : undefined}>
          <span className="rail-account-avatar"><Avatar value={user?.avatarUrl} name={name} /></span>
          <span className="rail-account-identity"><strong title={name}>{name}</strong><small className={"status-" + (user?.status ?? "offline")}><i aria-hidden="true" />{!user ? "не в сети" : user.status === "dnd" ? "не беспокоить" : user.status === "away" ? "нет на месте" : user.status === "offline" ? "не в сети" : "в сети"}</small></span>
        </button>
      </div>
    {user && <CreditBalance key={user.id} credits={user.credits} onOpenStore={onOpenGifts} />}
    {user && <div className="profile-quick-actions" aria-label="Быстрые действия профиля"><button type="button" className={"profile-quick-action online " + (user.status === "online" ? "selected" : "")} aria-label="В сети" title="В сети" onClick={() => onSetStatus("online")}><CircleDot size={16} /></button><button type="button" className={"profile-quick-action dnd " + (user.status === "dnd" ? "selected" : "")} aria-label="Не беспокоить" title="Не беспокоить" onClick={() => onSetStatus("dnd")}><BellOff size={16} /></button><button type="button" className="profile-quick-action settings" aria-label="Настройки профиля" title="Настройки" onClick={onOpenProfile}><Settings size={16} /></button><button type="button" className="profile-quick-action logout" aria-label="Выйти из профиля" title="Выйти" onClick={onLogout}><LogOut size={16} /></button></div>}
    </section>
    <nav className="rail-nav">
      {user && <button type="button" className={"rail-link rail-mobile-profile rail-mobile-primary" + (activeSection === "profile" ? " active" : "")} onClick={onOpenProfile} aria-label="Мой профиль" title="Мой профиль"><UserRound size={18} /><span>Профиль</span></button>}
      {user?.isGuest && <button type="button" className="rail-link" onClick={onOpenRegistration}><UserRound size={18} /><span>Регистрация</span></button>}
      <button className={"rail-link rail-mobile-primary " + (activeSection === "chat" ? "active" : "")} onClick={onOpenChat}><MessageCircle size={18} /><span>Чат</span>{unreadChatMessages > 0 && <b className="direct-unread-count">{unreadChatMessages > 99 ? "99+" : unreadChatMessages}</b>}</button>
      {(activeSection === "chat" || activeSection === "community-chat") && <button type="button" className="rail-link rail-mobile-people" onClick={onOpenPeople} aria-label="Кто в чате" title="Кто в чате"><UserRoundSearch size={18} /><span>Кто в чате</span></button>}
      <button className={"rail-link rail-mobile-primary " + (activeSection === "directs" ? "active" : "")} onClick={user ? onOpenDirects : () => onNotice("Войдите, чтобы открыть личку.")}><MessagesSquare size={18} /><span>Личка</span>{unreadDirects > 0 && <b className="direct-unread-count">{unreadDirects > 99 ? "99+" : unreadDirects}</b>}</button>
      {communityChatName && <button className={"rail-link " + (activeSection === "community-chat" ? "active" : "")} onClick={onOpenCommunityChat}><MessagesSquare size={18} /><span>{communityChatName}</span></button>}
      <button className={"rail-link rail-mobile-primary " + (activeSection === "notifications" ? "active" : "")} onClick={user ? onOpenNotifications : () => onNotice("Войдите, чтобы открыть уведомления.")}><Bell size={18} /><span>Уведомления</span>{unreadNotifications > 0 && <b className="direct-unread-count">{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}</button>
      <button className={"rail-link " + (activeSection === "communities" ? "active" : "")} onClick={onOpenCommunities} aria-label="Сообщества" title="Сообщества"><UsersRound size={18} /><span>Сообщества</span>{communityBadge > 0 && <b className="direct-unread-count">{communityBadge > 99 ? "99+" : communityBadge}</b>}</button>
      <button className={"rail-link " + (activeSection === "store" ? "active" : "")} onClick={onOpenGifts}><Gift size={18} /><span>Магазин</span>{shopBadge > 0 && <b className="direct-unread-count">{shopBadge > 99 ? "99+" : shopBadge}</b>}</button>
      <button type="button" className={"rail-link " + (activeSection === "radio" ? "active" : "")} onClick={onOpenRadio} aria-label="Радио TUSOVA" title="Радио TUSOVA"><Headphones size={18} /><span>Радио</span></button>
      {canModerate && <section className="rail-admin" aria-label="Административные функции"><span>УПРАВЛЕНИЕ</span><button className={"rail-link " + (activeSection === "reports" ? "active" : "")} onClick={onOpenReports}><ShieldCheck size={18} /><span>Модерация</span></button>{user?.role === "admin" && <button className={"rail-link " + (activeSection === "admin" ? "active" : "")} onClick={onOpenAdmin}><LayoutDashboard size={18} /><span>Управление</span></button>}</section>}
      {user && <CreditBalance key={user.id} credits={user.credits} mobile onOpenStore={onOpenGifts} />}
      <button type="button" className={"rail-link rail-mobile-primary rail-mobile-more-trigger" + (mobileMoreOpen ? " active" : "")} aria-label="Ещё разделы" title="Ещё" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen((open) => !open)}><Ellipsis size={20} /><span>Ещё</span></button>
    </nav>
    {mobileMoreOpen && <>
      <button type="button" className="rail-mobile-more-backdrop" aria-label="Закрыть дополнительное меню" onClick={() => setMobileMoreOpen(false)} />
      <section className="rail-mobile-more-menu" aria-label="Дополнительные разделы">
        {(activeSection === "chat" || activeSection === "community-chat") && <button type="button" onClick={() => runMobile(onOpenPeople)}><UserRoundSearch size={18} /><span>Кто в чате</span></button>}
        <button type="button" onClick={() => runMobile(onOpenRooms)}><DoorOpen size={18} /><span>Комнаты</span></button>
        {user?.isGuest && <button type="button" onClick={() => runMobile(onOpenRegistration)}><UserRound size={18} /><span>Регистрация</span></button>}
        {communityChatName && <button type="button" onClick={() => runMobile(onOpenCommunityChat)}><MessagesSquare size={18} /><span>{communityChatName}</span></button>}
        <button type="button" onClick={() => runMobile(onOpenCommunities)}><UsersRound size={18} /><span>Сообщества</span>{communityBadge > 0 && <b>{communityBadge > 99 ? "99+" : communityBadge}</b>}</button>
        <button type="button" onClick={() => runMobile(onOpenGifts)}><Gift size={18} /><span>Магазин</span>{shopBadge > 0 && <b>{shopBadge > 99 ? "99+" : shopBadge}</b>}</button>
        <button type="button" onClick={() => runMobile(onOpenRadio)}><Headphones size={18} /><span>Радио</span></button>
        {canModerate && <button type="button" onClick={() => runMobile(onOpenReports)}><ShieldCheck size={18} /><span>Модерация</span></button>}
        {user?.role === "admin" && <button type="button" onClick={() => runMobile(onOpenAdmin)}><LayoutDashboard size={18} /><span>Управление</span></button>}
        {user && <button type="button" className="danger" onClick={() => { setMobileMoreOpen(false); logoutDialogRef.current?.showModal(); }}><LogOut size={18} /><span>Выйти</span></button>}
      </section>
    </>}
    {user && <button type="button" className="rail-link rail-mobile-logout" onClick={() => logoutDialogRef.current?.showModal()} aria-label="Выйти из чата" title="Выйти из чата"><LogOut size={18} /><span>Выйти</span></button>}
    <dialog ref={logoutDialogRef} className="logout-confirm" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-description" onClick={(event) => { if (event.target === event.currentTarget) logoutDialogRef.current?.close(); }}>
      <section>
        <h2 id="logout-confirm-title">Выйти из чата?</h2>
        <p id="logout-confirm-description">Вы точно хотите выйти из своего аккаунта?</p>
        <div className="logout-confirm-actions">
          <button type="button" autoFocus onClick={() => logoutDialogRef.current?.close()}>Отмена</button>
          <button type="button" className="logout-confirm-submit" onClick={() => { logoutDialogRef.current?.close(); onLogout(); }}>Выйти</button>
        </div>
      </section>
    </dialog>
  </aside>;
}

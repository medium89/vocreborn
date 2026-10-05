import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Gender, Person, Room } from "@/lib/chat-contract";
import { BellOff, BellRing, Headphones, Crown, Flag, MessageCircle, Shield, ShieldCheck, Star, UserRound, UsersRound, X } from "lucide-react";
import { Avatar } from "./avatar";

type PrivateMessagePreview = { peerId: string; text: string };

const groups: Array<{ gender: Gender; title: string; description: string }> = [
  { gender: "male", title: "Парни", description: "Указали мужской пол" },
  { gender: "female", title: "Девушки", description: "Указали женский пол" },
  { gender: "unspecified", title: "Они", description: "Не указали пол" },
];

function PersonRow({ person, currentUserId, canModerate, muted, preview, onClick, onMention, onOpenPrivate, onModerate, onReport, onToggleMute }: { person: Person; currentUserId: string | null; canModerate: boolean; preview: string | null; onClick: (person: Person) => void; onMention: (person: Person) => void; onOpenPrivate: (person: Person) => void; onModerate: (person: Person) => void; onReport: (person: Person) => void; muted: boolean; onToggleMute: (person: Person, muted: boolean) => void }) {
  const [visiblePreview, setVisiblePreview] = useState(preview);
  const [isPreviewLeaving, setIsPreviewLeaving] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const avatarAnchorRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (preview) { setVisiblePreview(preview); setIsPreviewLeaving(false); return; }
    if (!visiblePreview) return;
    setIsPreviewLeaving(true);
    const timer = window.setTimeout(() => { setVisiblePreview(null); setIsPreviewLeaving(false); }, 180);
    return () => window.clearTimeout(timer);
  }, [preview]);
  useEffect(() => {
    if (!visiblePreview) {
      setPreviewPosition(null);
      return;
    }
    const position = () => {
      const anchor = avatarAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(320, Math.max(240, window.innerWidth - 32));
      const gap = 12;
      const preferredLeft = rect.left - width - gap;
      const left =
        preferredLeft >= 12
          ? preferredLeft
          : Math.min(window.innerWidth - width - 12, rect.right + gap);
      const top = Math.max(12, Math.min(rect.top + 34, window.innerHeight - 120));
      setPreviewPosition({ left, top });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [visiblePreview]);
  const isSelf = person.id === currentUserId;
  const role = person.hideRole ? null : person.role === "admin" ? "admin" : person.role === "moderator" ? "moderator" : null;
  const isVip = Boolean(person.appearance?.vip && person.appearance.vip.enabled !== false);
  const avatarRole = person.isDj ? "dj" : role ?? (isVip ? "vip" : null);
  return <div className="person">
    <span className={"presence person-presence " + person.status} />
    <span ref={avatarAnchorRef} className={"person-avatar-anchor" + (avatarRole ? " person-avatar-" + avatarRole : "")}>
      <button type="button" className="person-avatar-button" aria-label={"Открыть профиль " + person.name} onClick={() => onClick(person)}>
        <Avatar value={person.avatar} previewUrl={person.avatarThumbnail} previewHint="Нажмите, чтобы открыть профиль" onPreviewClick={() => onClick(person)} name={person.name} className={person.status} />
      </button>
      {avatarRole && <span className={"person-avatar-role person-avatar-role-" + avatarRole} title={avatarRole === "admin" ? "Администратор" : avatarRole === "moderator" ? "Модератор" : avatarRole === "dj" ? "DJ" : "VIP"} aria-hidden="true">
        {avatarRole === "dj" ? <Headphones size={11} /> : avatarRole === "admin" ? <ShieldCheck size={11} /> : avatarRole === "moderator" ? <Star size={11} fill="currentColor" /> : <Crown size={11} fill="currentColor" />}
      </span>}
    </span>
    <button type="button" className="person-main" title={person.name} onClick={() => isSelf ? onClick(person) : onMention(person)}>
      <span className="person-copy">
        <span className="person-name-line"><strong className={avatarRole ? "person-name-" + avatarRole : undefined}>{person.name}</strong></span>
      </span>
    </button>
    <div className="person-lower">
      <span className="person-role-badges">
        {person.isDj && <span className="person-role-badge person-role-badge-dj"><Headphones size={10} />DJ</span>}
        {person.isBot && person.username === "tusova_quiz" && <span className="person-role-badge quiz-bot-badge">Викторина</span>}
        {!role && !isVip && !person.isDj && !person.isBot && typeof person.isGuest === "boolean" && <span className={"person-role-badge person-role-badge-" + (person.isGuest ? "guest" : "member")}>{person.isGuest ? "Гость" : "Участник"}</span>}
        {role && <span className={"person-role-badge person-role-badge-" + role} role="img" aria-label={role === "admin" ? "Администратор" : "Модератор"} title={role === "admin" ? "Администратор" : "Модератор"}>{role === "admin" ? <ShieldCheck size={10} /> : <Star size={10} fill="currentColor" />}{role === "admin" ? "Админ" : "Модер"}</span>}
        {isVip && <span className="person-role-badge person-role-badge-vip"><Crown size={10} fill="currentColor" />VIP</span>}
      </span>
    </div>
    <span className="person-actions">
      <button type="button" className="person-profile" aria-label={"Посмотреть профиль " + person.name} title={"Посмотреть профиль " + person.name} onClick={() => onClick(person)}><UserRound size={14} /></button>
      {!isSelf && person.id && <button type="button" className="report-person" aria-label={"Пожаловаться на " + person.name} title={"Пожаловаться на " + person.name} onClick={() => onReport(person)}><Flag size={13} /></button>}
      {!isSelf && canModerate && person.id && (person.role !== "admin" || muted) && <button type="button" className="quick-mute" aria-label={muted ? "Снять мут с " + person.name : "Заглушить " + person.name} title={muted ? "Снять мут" : "Заглушить на 60 минут"} onClick={() => onToggleMute(person, muted)}>{muted ? <BellRing size={14} /> : <BellOff size={14} />}</button>}
      {canModerate && person.id && (!isSelf || role !== null) && <button type="button" className="moderate-person" aria-label={isSelf ? "Модерировать себя" : "Модерировать " + person.name} title={isSelf ? "Модерировать себя" : "Модерировать " + person.name} onClick={() => onModerate(person)}><Shield size={14} /></button>}
    </span>
    {visiblePreview && !isSelf && previewPosition && typeof document !== "undefined" && createPortal(
      <button
        type="button"
        className={"private-message-preview private-message-preview-portal " + (isPreviewLeaving ? "is-leaving" : "")}
        data-testid="private-message-preview"
        style={{ left: previewPosition.left, top: previewPosition.top }}
        aria-label={"Открыть личное сообщение от " + person.name}
        onClick={() => onOpenPrivate(person)}
      >
        <MessageCircle size={15} /><span><small>Личное сообщение</small><strong>{visiblePreview}</strong></span>
      </button>,
      document.body,
    )}
  </div>;
}

type PeoplePanelProps = {
  className?: string;
  showMobileToggle?: boolean;
  people: Person[]; rooms: Room[]; roomId: string; currentUserId: string | null; canModerate: boolean;
  privateMessagePreview: PrivateMessagePreview | null;
  onOpenDialog: (person: Person) => void; onMention: (person: Person) => void; onOpenPrivate: (person: Person) => void;
  onModerate: (person: Person) => void; onReport: (person: Person) => void;
  onChangeRoom: (roomId: string) => void; onOpenRooms: () => void; mutedPeople: Set<string>; onToggleMute: (person: Person, muted: boolean) => void;
};

export function PeoplePanel({ className = "", showMobileToggle = true, people, rooms, roomId, currentUserId, canModerate, privateMessagePreview, onOpenDialog, onMention, onOpenPrivate, onModerate, onReport, mutedPeople, onToggleMute, onChangeRoom, onOpenRooms }: PeoplePanelProps) {
  const visiblePeople = people.filter((person) => person.status !== "offline");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [roomId]);
  useEffect(() => { if (!showMobileToggle) setMobileOpen(false); }, [showMobileToggle]);
  useEffect(() => {
    if (!showMobileToggle) return;
    const openFromNavigation = () => setMobileOpen(true);
    window.addEventListener("tusova:open-mobile-people", openFromNavigation);
    return () => window.removeEventListener("tusova:open-mobile-people", openFromNavigation);
  }, [showMobileToggle]);
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);
  return <>
    {mobileOpen && <button type="button" className="mobile-people-backdrop" aria-label="Закрыть список участников" onClick={() => setMobileOpen(false)} />}
    <aside className={"people-panel " + className + (mobileOpen ? " mobile-open" : "")}>
    <div className="panel-title"><div><h3>Онлайн в чате</h3></div><span className="online-count">{visiblePeople.length}</span><button type="button" className="mobile-people-close" aria-label="Закрыть список участников" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
    <div className="people-list">
      {groups.map((group) => {
        const members = visiblePeople
          .filter((person) => person.gender === group.gender)
          .sort((left, right) => Number(right.id === currentUserId) - Number(left.id === currentUserId));
        if (members.length === 0) return null;
        return <section className="people-group" key={group.gender}>
          <div className="people-group-title"><span>{group.title}</span><small title={group.description}>{members.length}</small></div>
          {members.map((person) => <PersonRow key={person.id ?? person.name} person={person} currentUserId={currentUserId} canModerate={canModerate} muted={Boolean(person.id && mutedPeople.has(person.id))} preview={privateMessagePreview && privateMessagePreview.peerId === person.id ? privateMessagePreview.text : null} onClick={(target) => { setMobileOpen(false); onOpenDialog(target); }} onMention={(target) => { setMobileOpen(false); onMention(target); }} onOpenPrivate={(target) => { setMobileOpen(false); onOpenPrivate(target); }} onModerate={onModerate} onReport={onReport} onToggleMute={onToggleMute} />)}
        </section>;
      })}
    </div>
    <div className="room-switcher"><div className="room-switcher-head"><span>Комнаты</span><button onClick={() => { setMobileOpen(false); onOpenRooms(); }}>все</button></div>
      {rooms.map((room) => <button className={"room-row " + (room.id === roomId ? "selected" : "")} key={room.id} onClick={() => onChangeRoom(room.id)}><span className={"room-dot " + room.tone} /><span>{room.name}</span><small>{room.online}</small></button>)}
    </div>
  </aside></>;
}

import { useEffect, useState } from "react";

import type { Gender, Person, Room } from "@/lib/chat-contract";
import { BellOff, BellRing, Flag, MessageCircle, Shield, UserRound } from "lucide-react";
import { Avatar } from "./avatar";

type PrivateMessagePreview = { peerId: string; text: string };

const groups: Array<{ gender: Gender; title: string; description: string }> = [
  { gender: "male", title: "Мужчины", description: "Указали мужской пол" },
  { gender: "female", title: "Женщины", description: "Указали женский пол" },
  { gender: "unspecified", title: "Они", description: "Не указали пол" },
];

function PersonRow({ person, currentUserId, canModerate, muted, preview, onClick, onMention, onOpenPrivate, onModerate, onReport, onToggleMute }: { person: Person; currentUserId: string | null; canModerate: boolean; preview: string | null; onClick: (person: Person) => void; onMention: (person: Person) => void; onOpenPrivate: (person: Person) => void; onModerate: (person: Person) => void; onReport: (person: Person) => void; muted: boolean; onToggleMute: (person: Person, muted: boolean) => void }) {
  const [visiblePreview, setVisiblePreview] = useState(preview);
  const [isPreviewLeaving, setIsPreviewLeaving] = useState(false);
  useEffect(() => {
    if (preview) { setVisiblePreview(preview); setIsPreviewLeaving(false); return; }
    if (!visiblePreview) return;
    setIsPreviewLeaving(true);
    const timer = window.setTimeout(() => { setVisiblePreview(null); setIsPreviewLeaving(false); }, 180);
    return () => window.clearTimeout(timer);
  }, [preview]);
  const isSelf = person.id === currentUserId;
  const role = person.role === "admin" ? "администратор" : person.role === "moderator" ? "модератор" : undefined;
  const description = isSelf ? "это вы" : person.isBot ? "бот" : role ?? (person.status === "away" ? "нет на месте" : person.status === "offline" ? "не в сети" : person.room === "main" ? "в Главной" : "в комнате");
  return <div className="person">
    <span className={"presence person-presence " + person.status} /><span className="person-avatar-anchor"><button className="person-avatar-button" aria-label={"Открыть профиль " + person.name} title={"Открыть профиль " + person.name} onClick={() => !isSelf && onClick(person)}><Avatar value={person.avatar} previewUrl={person.avatarThumbnail} name={person.name} className={person.status} /></button>{visiblePreview && !isSelf && <button type="button" className={"private-message-preview " + (isPreviewLeaving ? "is-leaving" : "")} data-testid="private-message-preview" aria-label={"Открыть личное сообщение от " + person.name} onClick={(event) => { event.stopPropagation(); onOpenPrivate(person); }}><MessageCircle size={15} /><span><small>Личное сообщение</small><strong>{visiblePreview}</strong></span></button>}</span><button className="person-main" onClick={() => !isSelf && onMention(person)}><span className="person-copy"><strong>{person.name}</strong><small>{description}</small></span></button>{!isSelf && <button className="person-profile" aria-label={"Посмотреть профиль " + person.name} title={"Посмотреть профиль " + person.name} onClick={() => onClick(person)}><UserRound size={14} /></button>}
    {!isSelf && person.id && <button className="report-person" aria-label={"Пожаловаться на " + person.name} title={"Пожаловаться на " + person.name} onClick={() => onReport(person)}><Flag size={13} /></button>}
    {!isSelf && canModerate && person.id && <button className="quick-mute" aria-label={muted ? "Снять мут с " + person.name : "Заглушить " + person.name} title={muted ? "Снять мут" : "Заглушить на 60 минут"} onClick={() => onToggleMute(person, muted)}>{muted ? <BellRing size={14} /> : <BellOff size={14} />}</button>}{!isSelf && canModerate && person.id && <button className="moderate-person" aria-label={"Модерировать " + person.name} title={"Модерировать " + person.name} onClick={() => onModerate(person)}><Shield size={14} /></button>}
  </div>;
}

type PeoplePanelProps = {
  people: Person[]; rooms: Room[]; roomId: string; currentUserId: string | null; canModerate: boolean;
  privateMessagePreview: PrivateMessagePreview | null;
  onOpenDialog: (person: Person) => void; onMention: (person: Person) => void; onOpenPrivate: (person: Person) => void;
  onModerate: (person: Person) => void; onReport: (person: Person) => void;
  onChangeRoom: (roomId: string) => void; onOpenRooms: () => void; mutedPeople: Set<string>; onToggleMute: (person: Person, muted: boolean) => void;
};

export function PeoplePanel({ people, rooms, roomId, currentUserId, canModerate, privateMessagePreview, onOpenDialog, onMention, onOpenPrivate, onModerate, onReport, mutedPeople, onToggleMute, onChangeRoom, onOpenRooms }: PeoplePanelProps) {
  return <aside className="people-panel">
    <div className="panel-title"><div><h3>Онлайн в чате</h3></div><span className="online-count">{people.length}</span></div>
    <div className="people-list">
      {groups.map((group) => {
        const members = people.filter((person) => person.gender === group.gender);
        if (members.length === 0) return null;
        return <section className="people-group" key={group.gender}>
          <div className="people-group-title"><span>{group.title}</span><small title={group.description}>{members.length}</small></div>
          {members.map((person) => <PersonRow key={person.id ?? person.name} person={person} currentUserId={currentUserId} canModerate={canModerate} muted={Boolean(person.id && mutedPeople.has(person.id))} preview={privateMessagePreview && privateMessagePreview.peerId === person.id ? privateMessagePreview.text : null} onClick={onOpenDialog} onMention={onMention} onOpenPrivate={onOpenPrivate} onModerate={onModerate} onReport={onReport} onToggleMute={onToggleMute} />)}
        </section>;
      })}
    </div>
    <div className="room-switcher"><div className="room-switcher-head"><span>Комнаты</span><button onClick={onOpenRooms}>все</button></div>
      {rooms.map((room) => <button className={"room-row " + (room.id === roomId ? "selected" : "")} key={room.id} onClick={() => onChangeRoom(room.id)}><span className={"room-dot " + room.tone} /><span>{room.name}</span><small>{room.online}</small></button>)}
    </div>
  </aside>;
}
import { useEffect, useRef, useState } from "react";
import { BackToChatButton } from "./back-to-chat-button";
import { AvatarPicker } from "./avatar-picker";
import { StyledSelect } from "./styled-select";
import { Ban, Bell, Camera, ChevronDown, CircleDollarSign, Eye, KeyRound, LockKeyhole, Palette, Pencil, RefreshCw, Trash2, Save, ShieldOff, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { RecoveryCodePanel } from "./recovery-code-panel";
import { EmailSettingsPanel } from "./email-settings-panel";
import type { AuthUser, CosmeticAppearance, DirectConversation, Person, Room } from "@/lib/chat-contract";
import { Avatar } from "./avatar";
import { ProfileAlbums } from "./profile-albums";
import { TabAlertSettings } from "./tab-alert-settings";
import { ProfileAppearanceSettings } from "./appearance-settings";
import type { NotificationPreferences, TabAlertPreferences } from "@/lib/tab-alerts";

const roleLabels = { user: "УЧАСТНИК", moderator: "МОДЕРАТОР", admin: "АДМИНИСТРАТОР" } as const;

type RoomInput = { name: string; description: string; tone: string; coverEmoji: string; rules: string; visibility: "public" | "private"; isVideoRoom: boolean; coverFile: File | null };
type RoomsModalProps = {
  embedded?: boolean;
  rooms: Room[];
  user: AuthUser | null;
  onChangeRoom: (roomId: string) => void;
  onSaveRoom: (roomId: string | null, input: RoomInput) => Promise<void>;
  onClose: () => void;
};

type RoomEditor = { mode: "create" } | { mode: "edit"; room: Room };

export function RoomsModal({ embedded = false, rooms, user, onChangeRoom, onSaveRoom, onDeleteRoom, onClose }: RoomsModalProps & { onDeleteRoom: (room: Room) => Promise<void> }) {
  const empty: RoomInput = { name: "", description: "", tone: "lime", coverEmoji: "✦", rules: "", visibility: "public", isVideoRoom: false, coverFile: null };
  const [editor, setEditor] = useState<RoomEditor | null>(null);
  const [viewing, setViewing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [input, setInput] = useState<RoomInput>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = (room: Room) => user?.role === "admin" || room.createdById === user?.id;
  const editingRoom = editor?.mode === "edit" ? editor.room : null;
  const closeEditor = () => {
    if (busy) return;
    setEditor(null);
    setError("");
  };
  const beginCreate = () => {
    setInput(empty);
    setError("");
    setEditor({ mode: "create" });
  };
  const beginEdit = (room: Room) => {
    setInput({ name: room.name, description: room.description, tone: room.tone, coverEmoji: room.coverEmoji, rules: room.rules, visibility: room.visibility, isVideoRoom: room.isVideoRoom, coverFile: null });
    setError("");
    setEditor({ mode: "edit", room });
  };
  const beginDelete = (room: Room) => {
    setError("");
    setDeleting(room);
  };
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSaveRoom(editingRoom?.id ?? null, input);
      setEditor(null);
      setInput(empty);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить комнату");
    } finally {
      setBusy(false);
    }
  }
  async function remove(room: Room) {
    setBusy(true);
    setError("");
    try {
      await onDeleteRoom(room);
      setDeleting(null);
      if (viewing?.id === room.id) setViewing(null);
      if (editingRoom?.id === room.id) setEditor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить комнату");
    } finally {
      setBusy(false);
    }
  }
  function openRoom(room: Room) {
    setViewing(null);
    onChangeRoom(room.id);
  }
  return <div className={embedded ? "admin-rooms-panel" : "modal-backdrop"} onMouseDown={embedded ? undefined : onClose}>
    <div className={embedded ? "rooms-modal admin-rooms-content" : "modal rooms-modal"} onMouseDown={(event) => event.stopPropagation()}>
      {!embedded && <button type="button" className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>}
      <div className="rooms-crud-heading">
        <div>{!embedded && <h2>Комнаты</h2>}</div>
        {user && <button type="button" className="action-button" onClick={beginCreate}><Save size={15} /><span>Новая комната</span></button>}
      </div>
      <div className="rooms-scroll">
        {rooms.map((room) => <article className="modal-room" key={room.id}>
          <button type="button" className="room-card-summary" onClick={() => setViewing(room)} aria-label={"Открыть сведения о комнате " + room.name}>
            <span className={"orb " + room.tone} />
            <span className="room-card-copy"><strong>{room.name}{room.isVideoRoom ? " · видео" : ""}</strong><small>{room.description || "Без описания"} · {room.memberCount} участников</small></span>
            <b className="room-card-presence">{room.online} в сети</b>
          </button>
          <div className="admin-record-actions room-record-actions">
            <button type="button" title="Просмотреть" aria-label={"Просмотреть комнату " + room.name} onClick={() => setViewing(room)}><Eye size={16} /></button>
            {canManage(room) && <button type="button" title="Редактировать" aria-label={"Редактировать комнату " + room.name} onClick={() => beginEdit(room)}><Pencil size={16} /></button>}
            {canManage(room) && room.id !== "main" && <button type="button" className="danger" title="Удалить" aria-label={"Удалить комнату " + room.name} disabled={busy} onClick={() => beginDelete(room)}><Trash2 size={16} /></button>}
          </div>
        </article>)}
      </div>
    </div>
    {viewing && <div className="modal-backdrop rooms-record-backdrop" onMouseDown={(event) => { event.stopPropagation(); if (!busy) setViewing(null); }}>
      <section className="modal admin-record-dialog room-record-dialog" role="dialog" aria-modal="true" aria-label={"Сведения о комнате " + viewing.name} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Закрыть" title="Закрыть" disabled={busy} onClick={() => setViewing(null)}><X size={18} /></button>
        <h3>{viewing.name}</h3>
        <p className="admin-record-meta">{viewing.visibility === "public" ? "Публичная комната" : "Приватная комната"} · {viewing.memberCount} участников · {viewing.online} в сети</p>
        <dl className="room-record-details">
          <div><dt>Описание</dt><dd>{viewing.description || "Не указано"}</dd></div>
          <div><dt>Тип</dt><dd>{viewing.isVideoRoom ? "Совместный просмотр" : "Обычная комната"}</dd></div>
          {viewing.rules && <div><dt>Правила</dt><dd>{viewing.rules}</dd></div>}
        </dl>
        <footer>
          <button type="button" className="action-button secondary" disabled={busy} onClick={() => setViewing(null)}>Закрыть</button>
          {canManage(viewing) && <button type="button" className="action-button secondary" disabled={busy} onClick={() => { const room = viewing; setViewing(null); beginEdit(room); }}><Pencil size={15} />Редактировать</button>}
          {canManage(viewing) && viewing.id !== "main" && <button type="button" className="action-button danger" disabled={busy} onClick={() => { setViewing(null); beginDelete(viewing); }}><Trash2 size={15} />Удалить</button>}
          <button type="button" className="action-button" disabled={busy} onClick={() => openRoom(viewing)}>Открыть комнату</button>
        </footer>
      </section>
    </div>}
    {editor && user && <div className="modal-backdrop rooms-record-backdrop" onMouseDown={(event) => { event.stopPropagation(); closeEditor(); }}>
      <form className="modal admin-record-dialog room-editor-dialog" role="dialog" aria-modal="true" aria-label={editor.mode === "edit" ? "Редактирование комнаты" : "Новая комната"} onMouseDown={(event) => event.stopPropagation()} onSubmit={save}>
        <button type="button" className="modal-close" aria-label="Закрыть" title="Закрыть" disabled={busy} onClick={closeEditor}><X size={18} /></button>
        <h3>{editor.mode === "edit" ? "Редактирование комнаты" : "Новая комната"}</h3>
        <p className="admin-record-meta">{editor.mode === "edit" ? "Измените параметры комнаты и сохраните их." : "Заполните параметры новой комнаты."}</p>
        <div className="room-form">
          <label>Название<input value={input.name} minLength={2} maxLength={80} required onChange={(event) => setInput((old) => ({ ...old, name: event.target.value }))} /></label>
          <label>Описание<input value={input.description} maxLength={300} onChange={(event) => setInput((old) => ({ ...old, description: event.target.value }))} /></label>
          <label>Символ обложки<input value={input.coverEmoji} maxLength={12} onChange={(event) => setInput((old) => ({ ...old, coverEmoji: event.target.value }))} placeholder="✦" /></label>
          <label>Фото обложки<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setInput((old) => ({ ...old, coverFile: event.target.files?.[0] ?? null }))} /><small>{input.coverFile ? input.coverFile.name : "PNG, JPEG или WebP, до 10 МБ"}</small></label>
          <label>Видимость<StyledSelect value={input.visibility} onChange={(event) => setInput((old) => ({ ...old, visibility: event.target.value as "public" | "private" }))}><option value="public">Публичная</option><option value="private">Приватная</option></StyledSelect></label>
          {user.role === "admin" && <label className="room-video-kind"><input type="checkbox" checked={input.isVideoRoom} onChange={(event) => setInput((old) => ({ ...old, isVideoRoom: event.target.checked }))} /><span><strong>Комната совместного просмотра</strong><small>В ней доступна ссылка на YouTube, VK Видео или Rutube.</small></span></label>}
          <label>Правила комнаты<textarea value={input.rules} maxLength={1000} rows={3} onChange={(event) => setInput((old) => ({ ...old, rules: event.target.value }))} placeholder="Краткие правила для участников" /></label>
          <label>Цвет<StyledSelect value={input.tone} onChange={(event) => setInput((old) => ({ ...old, tone: event.target.value }))}><option value="lime">Салатовый</option><option value="gray">Серый</option></StyledSelect></label>
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <footer>
          <button type="button" className="action-button secondary" disabled={busy} onClick={closeEditor}>Отмена</button>
          <button className="action-button" disabled={busy || input.name.trim().length < 2}><Save size={15} />{busy ? "Сохранение…" : editor.mode === "edit" ? "Сохранить изменения" : "Создать комнату"}</button>
        </footer>
      </form>
    </div>}
    {deleting && <div className="modal-backdrop rooms-record-backdrop" onMouseDown={(event) => { event.stopPropagation(); if (!busy) setDeleting(null); }}>
      <section className="modal admin-record-dialog admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Подтверждение удаления комнаты" onMouseDown={(event) => event.stopPropagation()}>
        <h3>Удалить комнату?</h3>
        <p>Комната «{deleting.name}» и её история будут удалены без возможности восстановления.</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <footer>
          <button type="button" className="action-button secondary" disabled={busy} onClick={() => setDeleting(null)}>Отмена</button>
          <button type="button" className="action-button danger" disabled={busy} onClick={() => void remove(deleting)}><Trash2 size={15} />{busy ? "Удаление…" : "Удалить"}</button>
        </footer>
      </section>
    </div>}
  </div>;
}
type ProfilePageProps = { user: AuthUser; muted: boolean; onAppearanceChanged: (next: CosmeticAppearance) => void; tabAlertPreferences: TabAlertPreferences; onTabAlertPreferencesChange: (next: TabAlertPreferences) => void; notificationPreferences: NotificationPreferences; onNotificationPreferencesChange: (next: NotificationPreferences) => void; onSave: (input: { bio: string; gender: "male" | "female" | "unspecified"; hideRole?: boolean }, avatar: File | null) => Promise<void>; onRefresh: () => void; onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>; onClose: () => void };

export function ProfilePage({ user, muted, onAppearanceChanged, tabAlertPreferences, onTabAlertPreferencesChange, notificationPreferences, onNotificationPreferencesChange, onSave, onRefresh, onChangePassword, onClose }: ProfilePageProps) {
  const [section, setSection] = useState<"profile" | "albums" | "appearance" | "alerts" | "security">("profile"); const [genderMenu, setGenderMenu] = useState(false); const [bio, setBio] = useState(user.bio ?? ""); const [gender, setGender] = useState(user.gender); const [hideRole, setHideRole] = useState(Boolean(user.hideRole)); const [avatar, setAvatar] = useState<File | null>(null); const [avatarPreview, setAvatarPreview] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [securityMessage, setSecurityMessage] = useState("");
  useEffect(() => {
    if (!avatar) return;
    const url = URL.createObjectURL(avatar); setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); try { await onSave({ bio, gender, hideRole }, avatar); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль"); } finally { setBusy(false); } }
  async function change(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setSecurityMessage(""); try { await onChangePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); setSecurityMessage("Пароль изменён. Остальные сессии завершены."); } catch (cause) { setSecurityMessage(cause instanceof Error ? cause.message : "Не удалось изменить пароль"); } finally { setBusy(false); } }
  return <section className="profile-page" aria-label="Мой профиль"><header className="conversation-head profile-page-header"><div><span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h2>Мой профиль</h2></div><BackToChatButton onClick={onClose} /></header><section className="profile-settings-page profile-settings-modal"><aside className="profile-settings-nav"><div className="profile-settings-person"><Avatar value={avatarPreview || user.avatarUrl} name={user.displayName} className="profile-avatar admin" />{section === "profile" && <AvatarPicker className="profile-photo-button" label="Сменить фото" disabled={busy} onSelected={setAvatar} />}<span className="eyebrow">{roleLabels[user.role]}</span><strong>{user.displayName}</strong></div><nav className="profile-settings-links"><button type="button" className={'profile-settings-link ' + (section === "profile" ? "active" : "")} onClick={() => setSection("profile")}><UserRound size={18} /><span><b>Профиль</b><small>Личные данные и статус</small></span></button><button type="button" className={'profile-settings-link ' + (section === "albums" ? "active" : "")} onClick={() => setSection("albums")}><Camera size={18} /><span><b>Фотоальбомы</b><small>До {user.appearance?.vip ? 5 : 2} альбомов</small></span></button><button type="button" className={'profile-settings-link ' + (section === "appearance" ? "active" : "")} onClick={() => setSection("appearance")}><Palette size={18} /><span><b>Оформление</b><small>Никнейм, сообщения и профиль</small></span></button><button type="button" className={'profile-settings-link ' + (section === "alerts" ? "active" : "")} onClick={() => setSection("alerts")}><Bell size={18} /><span><b>Оповещения</b><small>Вкладка и уведомления</small></span></button><button type="button" className={'profile-settings-link ' + (section === "security" ? "active" : "")} onClick={() => setSection("security")}><ShieldOff size={18} /><span><b>Безопасность</b><small>Защита аккаунта</small></span></button><span className="profile-settings-link disabled"><CircleDollarSign size={18} /><span><b>Валюта</b><small>{user.credits} кредитов</small></span></span></nav></aside>{section === "profile" ? <form className="profile-settings-content" onSubmit={save}><p className="profile-section-lead">Управляйте своей информацией, чтобы другие пользователи могли лучше узнать вас.</p><section className="profile-settings-summary"><Avatar value={avatarPreview || user.avatarUrl} name={user.displayName} className="profile-avatar admin" /><div className="profile-settings-identity"><strong>{user.displayName}</strong><AvatarPicker className="profile-photo-button" label="Выбрать фото" disabled={busy} onSelected={setAvatar} /><span>JPG, PNG или WEBP до 10 МБ. После выбора настройте область фото.</span></div></section><div className="profile-settings-fields"><label>Отображаемое имя<span className="profile-field profile-field-locked"><LockKeyhole size={16} /><span className="profile-name-readonly">{user.displayName}</span></span><small className="profile-name-hint">Смена имени появится в магазине.</small></label><label>О себе<span className="profile-field profile-bio-field"><Pencil size={16} /><textarea value={bio} maxLength={500} rows={3} onChange={(event) => setBio(event.target.value)} /><small>{bio.length}/500</small></span></label><label>Пол<span className="profile-field profile-gender-field"><UserRound size={16} /><button type="button" className="profile-gender-trigger" aria-haspopup="listbox" aria-expanded={genderMenu} onClick={() => setGenderMenu((open) => !open)}><span>{gender === "male" ? "Мужской" : gender === "female" ? "Женский" : "Не указывать"}</span><ChevronDown size={17} /></button>{genderMenu && <span className="profile-gender-options" role="listbox" aria-label="Выбор пола"><button type="button" className={gender === "male" ? "selected" : ""} role="option" aria-selected={gender === "male"} onClick={() => { setGender("male"); setGenderMenu(false); }}>Мужской</button><button type="button" className={gender === "female" ? "selected" : ""} role="option" aria-selected={gender === "female"} onClick={() => { setGender("female"); setGenderMenu(false); }}>Женский</button><button type="button" className={gender === "unspecified" ? "selected" : ""} role="option" aria-selected={gender === "unspecified"} onClick={() => { setGender("unspecified"); setGenderMenu(false); }}>Не указывать</button></span>}</span></label>{(user.role === "admin" || user.role === "moderator") && <label className="profile-role-visibility"><input type="checkbox" checked={hideRole} onChange={(event) => setHideRole(event.target.checked)} /><span><strong>Скрывать роль</strong><small>Не показывать другим участникам, что вы администратор или модератор.</small></span></label>}{error && <div className="auth-error">{error}</div>}{muted && <div className="mute-warning">Вам временно запрещена отправка сообщений.</div>}</div><footer className="profile-settings-footer"><button type="button" className="action-button secondary" onClick={() => setSection("security")}><KeyRound size={15} /><span>Сменить пароль</span></button><button type="button" className="action-button secondary" onClick={onRefresh}><RefreshCw size={15} /><span>Обновить данные с сервера</span></button><button className="action-button" disabled={busy}><Save size={15} /><span>{busy ? "Сохранение…" : "Сохранить профиль"}</span></button></footer></form> : section === "albums" ? <ProfileAlbums vip={Boolean(user.appearance?.vip)} /> : section === "appearance" ? <ProfileAppearanceSettings appearance={user.appearance} onSaved={onAppearanceChanged} /> : section === "alerts" ? <TabAlertSettings value={tabAlertPreferences} onChange={onTabAlertPreferencesChange} notificationPreferences={notificationPreferences} onNotificationPreferencesChange={onNotificationPreferencesChange} admin={user.role === "admin"} /> : <form className="profile-settings-content" onSubmit={change}><p className="profile-section-lead">После смены пароля остальные сессии будут завершены.</p><div className="profile-settings-fields"><label>Текущий пароль<span className="profile-field"><KeyRound size={16} /><input type="password" autoComplete="current-password" minLength={10} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></span></label><label>Новый пароль<span className="profile-field"><KeyRound size={16} /><input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></span></label>{securityMessage && <div className="security-message">{securityMessage}</div>}</div><EmailSettingsPanel user={user} currentPassword={currentPassword} onRefresh={onRefresh} /><RecoveryCodePanel key={currentPassword} currentPassword={currentPassword} /><footer className="profile-settings-footer"><button type="button" className="action-button secondary" onClick={() => setSection("profile")}>К профилю</button><button className="action-button" disabled={busy || currentPassword.length < 10 || newPassword.length < 10}><KeyRound size={15} /><span>{busy ? "Сохранение…" : "Сменить пароль"}</span></button></footer></form>}</section></section>;
}
type DirectsModalProps = {
  conversations: DirectConversation[];
  onOpenDialog: (person: Person) => void;
  onClose: () => void;
};

export function DirectsModal({ conversations, onOpenDialog, onClose }: DirectsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal directs-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
        <h2>Личка</h2>
        {conversations.length === 0 ? (
          <div className="direct-empty">Диалогов пока нет. Начните переписку, выбрав пользователя справа.</div>
        ) : (
          <div className="direct-list">
            {conversations.map((conversation) => (
              <button className="direct-row" key={conversation.peer.id} onClick={() => onOpenDialog(conversation.peer)}>
                <Avatar value={conversation.peer.avatar} name={conversation.peer.name} className={conversation.peer.status} />
                <span className="direct-copy">
                  <span><strong>{conversation.peer.name}</strong><time>{conversation.lastMessage.time}</time></span>
                  <small>{conversation.lastMessage.mine ? "Вы: " : ""}{conversation.lastMessage.body || "Вложение"}</small>
                </span>
                {conversation.unread > 0 && <b className="unread-badge">{conversation.unread > 99 ? "99+" : conversation.unread}</b>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
type ModerationAction = "mute" | "unmute" | "chaos" | "unchaos" | "ban" | "unban";
type ModerationModalProps = { person: Person; canBan: boolean; onAction: (action: ModerationAction, durationMinutes: number, reason: string) => Promise<void>; onClose: () => void };
export function ModerationModal({ person, canBan, onAction, onClose }: ModerationModalProps) {
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: ModerationAction) {
    setBusy(true); setError("");
    try { await onAction(action, durationMinutes, reason); onClose(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Действие не выполнено"); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}><div className="modal moderation-modal" role="dialog" aria-modal="true" aria-label={"Модерация пользователя " + person.name} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button><span className="eyebrow">МОДЕРАЦИЯ ПОЛЬЗОВАТЕЛЯ</span><h2>{person.name}</h2>
      <label>Срок ограничения<StyledSelect value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}><option value={15}>15 минут</option><option value={60}>1 час</option><option value={1440}>1 день</option><option value={10080}>7 дней</option></StyledSelect></label>
      <label>Причина<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Необязательно" /></label>
      {person.role === "admin" && <p>Администратора нельзя мутить, отправлять в «Хаос» или блокировать. Снятие старых ограничений доступно.</p>}
      {error && <div className="auth-error">{error}</div>}
      <div className="moderation-actions"><button disabled={busy || person.role === "admin"} onClick={() => void run("mute")}><VolumeX size={14} /><span>Запретить отправку</span></button><button disabled={busy} className="secondary" onClick={() => void run("unmute")}><Volume2 size={14} /><span>Снять запрет</span></button><button disabled={busy || person.role === "admin"} onClick={() => void run("chaos")}><Ban size={14} /><span>Хаос</span></button><button disabled={busy} className="secondary" onClick={() => void run("unchaos")}><ShieldOff size={14} /><span>Снять Хаос</span></button>{canBan && <button disabled={busy || person.role === "admin"} className="danger" onClick={() => void run("ban")}><Ban size={14} /><span>Заблокировать</span></button>}{canBan && <button disabled={busy} className="secondary" onClick={() => void run("unban")}><ShieldOff size={14} /><span>Снять блокировку</span></button>}</div>
    </div></div>
  );
}

import { useRef, useState } from "react";
import { StyledSelect } from "./styled-select";
import { Ban, Bell, Camera, ChevronDown, CircleDollarSign, KeyRound, LockKeyhole, Palette, Pencil, RefreshCw, Save, ShieldOff, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { RecoveryCodePanel } from "./recovery-code-panel";
import { EmailSettingsPanel } from "./email-settings-panel";
import type { AuthUser, CosmeticAppearance, DirectConversation, Person, Room } from "@/lib/chat-contract";
import { Avatar } from "./avatar";
import { ProfileAlbums } from "./profile-albums";
import { TabAlertSettings } from "./tab-alert-settings";
import { ProfileAppearanceSettings } from "./appearance-settings";
import type { NotificationPreferences, TabAlertPreferences } from "@/lib/tab-alerts";

const roleLabels = { user: "УЧАСТНИК", moderator: "МОДЕРАТОР", admin: "АДМИНИСТРАТОР" } as const;

async function cropAvatar(file: File, x: number, y: number, zoom: number) {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = URL.createObjectURL(file); });
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
  const context = canvas.getContext("2d"); if (!context) return file;
  const scale = Math.max(512 / source.naturalWidth, 512 / source.naturalHeight) * zoom;
  const width = source.naturalWidth * scale, height = source.naturalHeight * scale;
  const left = Math.min(0, 512 - width) * (x / 100), top = Math.min(0, 512 - height) * (y / 100);
  context.drawImage(source, left, top, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .9));
  return blob ? new File([blob], "avatar-crop.webp", { type: "image/webp" }) : file;
}

type RoomInput = { name: string; description: string; tone: string; coverEmoji: string; rules: string; visibility: "public" | "private"; coverFile: File | null };
type RoomsModalProps = {
  rooms: Room[];
  user: AuthUser | null;
  onChangeRoom: (roomId: string) => void;
  onSaveRoom: (roomId: string | null, input: RoomInput) => Promise<void>;
  onClose: () => void;
};

export function RoomsModal({ rooms, user, onChangeRoom, onSaveRoom, onClose }: RoomsModalProps) {
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("lime");
  const [coverEmoji, setCoverEmoji] = useState("✦");
  const [rules, setRules] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const manageable = rooms.filter((room) => user?.role === "admin" || room.createdById === user?.id);

  function selectMode(roomId: string) {
    setEditingId(roomId);
    const selected = rooms.find((room) => room.id === roomId);
    setName(selected?.name ?? "");
    setDescription(selected?.description ?? "");
    setTone(selected?.tone ?? "lime");
    setCoverEmoji(selected?.coverEmoji ?? "✦");
    setRules(selected?.rules ?? "");
    setVisibility(selected?.visibility ?? "public");
    setCoverFile(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await onSaveRoom(editingId || null, { name, description, tone, coverEmoji, rules, visibility, coverFile });
      setEditingId(""); setName(""); setDescription(""); setTone("lime"); setCoverEmoji("✦"); setRules(""); setVisibility("public"); setCoverFile(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить комнату");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rooms-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
        <h2>Комнаты</h2>
        <div className="rooms-scroll">
          {rooms.map((room) => (
            <button className="modal-room" key={room.id} onClick={() => onChangeRoom(room.id)}>
              <span className={"orb " + room.tone} />
              <span><strong>{room.name}</strong><small>{room.description || "Без описания"} · {room.memberCount} участников</small></span>
              <b>{room.online} в сети</b>
            </button>
          ))}
        </div>
        {user && <form className="room-form" onSubmit={save}>
          <h3>{editingId ? "Редактировать комнату" : "Новая комната"}</h3>
          {manageable.length > 0 && <label>Режим<StyledSelect value={editingId} onChange={(event) => selectMode(event.target.value)}><option value="">Создать новую</option>{manageable.map((room) => <option key={room.id} value={room.id}>Изменить: {room.name}</option>)}</StyledSelect></label>}
          <label>Название<input value={name} minLength={2} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
          <label>Описание<input value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Символ обложки<input value={coverEmoji} maxLength={12} onChange={(event) => setCoverEmoji(event.target.value)} placeholder="✦" /></label>
          <label>Фото обложки<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /><small>{coverFile ? coverFile.name : "PNG, JPEG или WebP, до 10 МБ"}</small></label>
          <label>Видимость<StyledSelect value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")}><option value="public">Публичная</option><option value="private">Приватная</option></StyledSelect></label>
          <label>Правила комнаты<textarea value={rules} maxLength={1000} rows={3} onChange={(event) => setRules(event.target.value)} placeholder="Краткие правила для участников" /></label>
          <label>Цвет<StyledSelect value={tone} onChange={(event) => setTone(event.target.value)}><option value="lime">Салатовый</option><option value="gray">Серый</option></StyledSelect></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="action-button" disabled={busy || name.trim().length < 2}><Save size={15} /><span>{busy ? "Сохранение…" : editingId ? "Сохранить изменения" : "Создать комнату"}</span></button>
        </form>}
      </div>
    </div>
  );
}

type ProfileModalProps = { user: AuthUser; muted: boolean; onAppearanceChanged: (next: CosmeticAppearance) => void; tabAlertPreferences: TabAlertPreferences; onTabAlertPreferencesChange: (next: TabAlertPreferences) => void; notificationPreferences: NotificationPreferences; onNotificationPreferencesChange: (next: NotificationPreferences) => void; onSave: (input: { bio: string; gender: "male" | "female" | "unspecified" }, avatar: File | null) => Promise<void>; onRefresh: () => void; onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>; onClose: () => void };

export function ProfileModal({ user, muted, onAppearanceChanged, tabAlertPreferences, onTabAlertPreferencesChange, notificationPreferences, onNotificationPreferencesChange, onSave, onRefresh, onChangePassword, onClose }: ProfileModalProps) {
  const [section, setSection] = useState<"profile" | "albums" | "appearance" | "alerts" | "security">("profile"); const [genderMenu, setGenderMenu] = useState(false); const [bio, setBio] = useState(user.bio ?? ""); const [gender, setGender] = useState(user.gender); const [avatar, setAvatar] = useState<File | null>(null); const [avatarPreview, setAvatarPreview] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [securityMessage, setSecurityMessage] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); try { await onSave({ bio, gender }, avatar ? await cropAvatar(avatar, 50, 50, 1) : null); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль"); } finally { setBusy(false); } }
  async function change(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setSecurityMessage(""); try { await onChangePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); setSecurityMessage("Пароль изменён. Остальные сессии завершены."); } catch (cause) { setSecurityMessage(cause instanceof Error ? cause.message : "Не удалось изменить пароль"); } finally { setBusy(false); } }
  return <div className="modal-backdrop profile-settings-backdrop" onClick={onClose}><section className="modal profile-settings-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Закрыть" onClick={onClose}><X size={19} /></button><aside className="profile-settings-nav"><div className="profile-settings-person"><Avatar value={avatarPreview || user.avatarUrl} name={user.displayName} className="profile-avatar admin" />{section === "profile" && <label className="profile-photo-button"><Camera size={14} />Сменить фото<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setAvatar(file); setAvatarPreview(file ? URL.createObjectURL(file) : ""); }} /></label>}<span className="eyebrow">{roleLabels[user.role]}</span><strong>{user.displayName}</strong><small>@{user.username}</small></div><nav className="profile-settings-links"><button type="button" className={'profile-settings-link ' + (section === "profile" ? "active" : "")} onClick={() => setSection("profile")}><UserRound size={18} /><span><b>Профиль</b><small>Личные данные и статус</small></span></button><button type="button" className={'profile-settings-link ' + (section === "albums" ? "active" : "")} onClick={() => setSection("albums")}><Camera size={18} /><span><b>Фотоальбомы</b><small>До {user.appearance?.vip ? 5 : 2} альбомов</small></span></button><button type="button" className={'profile-settings-link ' + (section === "appearance" ? "active" : "")} onClick={() => setSection("appearance")}><Palette size={18} /><span><b>Оформление</b><small>Никнейм, сообщения и профиль</small></span></button><button type="button" className={'profile-settings-link ' + (section === "alerts" ? "active" : "")} onClick={() => setSection("alerts")}><Bell size={18} /><span><b>Оповещения</b><small>Вкладка и уведомления</small></span></button><button type="button" className={'profile-settings-link ' + (section === "security" ? "active" : "")} onClick={() => setSection("security")}><ShieldOff size={18} /><span><b>Безопасность</b><small>Защита аккаунта</small></span></button><span className="profile-settings-link disabled"><CircleDollarSign size={18} /><span><b>Валюта</b><small>{user.credits} кредитов</small></span></span></nav></aside>{section === "profile" ? <form className="profile-settings-content" onSubmit={save}><header><h2>Настройки профиля</h2><p>Управляйте своей информацией, чтобы другие пользователи могли лучше узнать вас.</p></header><section className="profile-settings-summary"><Avatar value={avatarPreview || user.avatarUrl} name={user.displayName} className="profile-avatar admin" /><div className="profile-settings-identity"><strong>{user.displayName}</strong><small>@{user.username}</small><label className="profile-photo-button"><Camera size={16} />Выбрать фото<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setAvatar(file); setAvatarPreview(file ? URL.createObjectURL(file) : ""); }} /></label><span>JPG, PNG или WEBP. Макс. 5 МБ.</span></div></section><div className="profile-settings-fields"><label>Отображаемое имя<span className="profile-field profile-field-locked"><LockKeyhole size={16} /><span className="profile-name-readonly">{user.displayName}</span></span><small className="profile-name-hint">Смена имени появится в магазине.</small></label><label>О себе<span className="profile-field profile-bio-field"><Pencil size={16} /><textarea value={bio} maxLength={500} rows={3} onChange={(event) => setBio(event.target.value)} /><small>{bio.length}/500</small></span></label><label>Пол<span className="profile-field profile-gender-field"><UserRound size={16} /><button type="button" className="profile-gender-trigger" aria-haspopup="listbox" aria-expanded={genderMenu} onClick={() => setGenderMenu((open) => !open)}><span>{gender === "male" ? "Мужской" : gender === "female" ? "Женский" : "Не указывать"}</span><ChevronDown size={17} /></button>{genderMenu && <span className="profile-gender-options" role="listbox" aria-label="Выбор пола"><button type="button" className={gender === "male" ? "selected" : ""} role="option" aria-selected={gender === "male"} onClick={() => { setGender("male"); setGenderMenu(false); }}>Мужской</button><button type="button" className={gender === "female" ? "selected" : ""} role="option" aria-selected={gender === "female"} onClick={() => { setGender("female"); setGenderMenu(false); }}>Женский</button><button type="button" className={gender === "unspecified" ? "selected" : ""} role="option" aria-selected={gender === "unspecified"} onClick={() => { setGender("unspecified"); setGenderMenu(false); }}>Не указывать</button></span>}</span></label>{error && <div className="auth-error">{error}</div>}{muted && <div className="mute-warning">Вам временно запрещена отправка сообщений.</div>}</div><footer className="profile-settings-footer"><button type="button" className="action-button secondary" onClick={() => setSection("security")}><KeyRound size={15} /><span>Сменить пароль</span></button><button type="button" className="action-button secondary" onClick={onRefresh}><RefreshCw size={15} /><span>Обновить данные с сервера</span></button><button className="action-button" disabled={busy}><Save size={15} /><span>{busy ? "Сохранение…" : "Сохранить профиль"}</span></button></footer></form> : section === "albums" ? <ProfileAlbums vip={Boolean(user.appearance?.vip)} /> : section === "appearance" ? <ProfileAppearanceSettings appearance={user.appearance} onSaved={onAppearanceChanged} /> : section === "alerts" ? <TabAlertSettings value={tabAlertPreferences} onChange={onTabAlertPreferencesChange} notificationPreferences={notificationPreferences} onNotificationPreferencesChange={onNotificationPreferencesChange} /> : <form className="profile-settings-content" onSubmit={change}><header><h2>Безопасность</h2><p>После смены пароля остальные сессии будут завершены.</p></header><div className="profile-settings-fields"><label>Текущий пароль<span className="profile-field"><KeyRound size={16} /><input type="password" autoComplete="current-password" minLength={10} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></span></label><label>Новый пароль<span className="profile-field"><KeyRound size={16} /><input type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></span></label>{securityMessage && <div className="security-message">{securityMessage}</div>}</div><EmailSettingsPanel user={user} currentPassword={currentPassword} onRefresh={onRefresh} /><RecoveryCodePanel key={currentPassword} currentPassword={currentPassword} /><footer className="profile-settings-footer"><button type="button" className="action-button secondary" onClick={() => setSection("profile")}>К профилю</button><button className="action-button" disabled={busy || currentPassword.length < 10 || newPassword.length < 10}><KeyRound size={15} /><span>{busy ? "Сохранение…" : "Сменить пароль"}</span></button></footer></form>}</section></div>;
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
      {error && <div className="auth-error">{error}</div>}
      <div className="moderation-actions"><button disabled={busy} onClick={() => void run("mute")}><VolumeX size={14} /><span>Запретить отправку</span></button><button disabled={busy} className="secondary" onClick={() => void run("unmute")}><Volume2 size={14} /><span>Снять запрет</span></button><button disabled={busy} onClick={() => void run("chaos")}><Ban size={14} /><span>Хаос</span></button><button disabled={busy} className="secondary" onClick={() => void run("unchaos")}><ShieldOff size={14} /><span>Снять Хаос</span></button>{canBan && <button disabled={busy} className="danger" onClick={() => void run("ban")}><Ban size={14} /><span>Заблокировать</span></button>}{canBan && <button disabled={busy} className="secondary" onClick={() => void run("unban")}><ShieldOff size={14} /><span>Снять блокировку</span></button>}</div>
    </div></div>
  );
}

"use client";
import { adminRequest } from "@/lib/admin-api";
import { AdminEconomyLedger } from "./admin-operational-panels";

import { useEffect, useRef, useState } from "react";
import { StyledSelect } from "./styled-select";
import { ArrowLeft, Ban, Coins, Save, Shield, Trash2, UserRound, Volume2, VolumeX } from "lucide-react";
import type { AuthUser, Person } from "@/lib/chat-contract";
import { deactivateEditableUser, fetchEditableUser, removeEditableUserAvatar, updateEditableUser, uploadEditableUserAvatar, type EditableUser, type EditableUserChanges } from "@/lib/user-editor-api";
import { setRadioDj } from "@/lib/radio-api";
import { Avatar } from "./avatar";
import { AvatarPicker } from "./avatar-picker";

type Section = "appearance" | "profile" | "economy" | "access" | "moderation";
type Action = "mute" | "unmute" | "chaos" | "unchaos" | "ban" | "unban";
type Props = {
  backLabel?: string; person: Person; actor: AuthUser; onBack: () => void; onChanged: () => void;
  onModerate: (action: Action, durationMinutes: number, reason: string) => Promise<void>;
};
const sections: Array<{ id: Section; label: string; icon: typeof UserRound }> = [
  { id: "profile", label: "Профиль", icon: UserRound },
  { id: "economy", label: "Рейтинг и кредиты", icon: Coins },
  { id: "appearance", label: "Оформление и VIP", icon: UserRound },
  { id: "access", label: "Доступ", icon: Shield },
  { id: "moderation", label: "Модерация", icon: Ban },
];
const roleLabels = { user: "Участник", moderator: "Модератор", admin: "Администратор" };

export function UserEditorPage({ backLabel = "К чату", person, actor, onBack, onChanged, onModerate }: Props) {
  const [record, setRecord] = useState<EditableUser | null>(null);
  const [draft, setDraft] = useState<EditableUserChanges>({});
  const [section, setSection] = useState<Section>(actor.role === "admin" ? "profile" : "moderation");
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState("");
  const [creditMode, setCreditMode] = useState<"add" | "remove" | "set">("add");
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditReason, setCreditReason] = useState("");
  const creditAttempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const [cosmetic, setCosmetic] = useState("vip");
  const [cosmeticReason, setCosmeticReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isAdmin = actor.role === "admin";

  function load(next: EditableUser) {
    setRecord(next);
    setDraft({ username: next.username, displayName: next.displayName, bio: next.bio ?? "", gender: next.gender, role: next.role, hideRole: next.hideRole, rating: next.rating, credits: next.credits });
  }
  useEffect(() => {
    let active = true;
    setRecord(null); setError(""); setNotice(""); setSection(actor.role === "admin" ? "profile" : "moderation");
    void fetchEditableUser(person.id ?? "").then((next) => { if (active) load(next); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить пользователя"); });
    return () => { active = false; };
  }, [person.id, actor.role]);

  async function save(fields: Array<keyof EditableUserChanges>) {
    if (!record) return;
    const changes = Object.fromEntries(fields.filter((field) => draft[field] !== record[field]).map((field) => [field, draft[field]])) as EditableUserChanges;
    if (!Object.keys(changes).length) { setNotice("Изменений нет."); return; }
    setBusy(true); setError(""); setNotice("");
    try { load(await updateEditableUser(record.id, changes)); onChanged(); setNotice("Изменения сохранены."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить изменения"); }
    finally { setBusy(false); }
  }
  async function adjustCredits() {
    if (!record) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const input = { mode: creditMode, amount: creditAmount, reason: creditReason.trim() };
      const fingerprint = JSON.stringify({ userId: record.id, ...input });
      if (creditAttempt.current?.fingerprint !== fingerprint) creditAttempt.current = { fingerprint, requestId: crypto.randomUUID() };
      await adminRequest("users/" + record.id + "/credits", { ...input, requestId: creditAttempt.current.requestId }, "POST");
      load(await fetchEditableUser(record.id)); creditAttempt.current = null; setCreditReason(""); onChanged(); setNotice("Кредиты изменены. Операция записана в журнал экономики.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить баланс"); }
    finally { setBusy(false); }
  }
  async function changeCosmetic(action: "grant" | "revoke") {
    if (!record) return;
    setBusy(true); setError(""); setNotice("");
    try { load(await adminRequest<EditableUser>("users/" + record.id + "/cosmetics", { effectKey: cosmetic, action, reason: cosmeticReason.trim() }, "POST")); onChanged(); setNotice("Оформление обновлено."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить оформление"); }
    finally { setBusy(false); }
  }
  async function revokeSessions() {
    if (!record || !window.confirm("Завершить все сеансы пользователя?")) return;
    setBusy(true); setError("");
    try { await adminRequest("users/" + record.id + "/sessions/revoke", {}, "POST"); load(await fetchEditableUser(record.id)); setNotice("Сеансы завершены. Пользователь сможет войти заново."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось завершить сеансы"); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!record || !file) return;
    setBusy(true); setError(""); setNotice("");
    try { load(await uploadEditableUserAvatar(record.id, file)); onChanged(); setNotice("Аватар обновлён."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить аватар"); }
    finally { setBusy(false); }
  }
  async function removeAvatar() {
    if (!record || !window.confirm("Удалить аватар этого пользователя?")) return;
    setBusy(true); setError(""); setNotice("");
    try { load(await removeEditableUserAvatar(record.id)); onChanged(); setNotice("Аватар удалён."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить аватар"); }
    finally { setBusy(false); }
  }
  async function deactivate() {
    if (!record || !window.confirm("Отключить аккаунт @" + record.username + "? Все сеансы пользователя завершатся. Сообщения и связанные данные сохранятся.")) return;
    setBusy(true); setError("");
    try { await deactivateEditableUser(record.id); onChanged(); onBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отключить аккаунт"); setBusy(false); }
  }
  async function moderate(action: Action) {
    if (!record) return;
    setBusy(true); setError(""); setNotice("");
    try { await onModerate(action, duration, reason); setNotice("Действие модерации выполнено."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Действие не выполнено"); }
    finally { setBusy(false); }
  }

  const tabItems = isAdmin ? sections : sections.filter((item) => item.id === "moderation");
  return <section className="user-editor-page">
    <header className="user-editor-head">
      <div className="page-heading"><span className="page-heading-icon"><Shield size={19} /></span><div className="page-heading-copy"><span className="eyebrow">УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕМ</span><h2>{record?.displayName ?? person.name}</h2></div></div>
      <button type="button" className="action-button secondary user-editor-back" onClick={onBack}><ArrowLeft size={15} />{backLabel}</button>
    </header>
    <nav className="user-editor-tabs" aria-label="Разделы редактирования">{tabItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={"user-editor-pill" + (section === id ? " active" : "")} aria-current={section === id ? "page" : undefined} onClick={() => { setSection(id); setError(""); setNotice(""); }}><Icon size={14} />{label}</button>)}</nav>
    <div className="user-editor-scroll">
      {record && <div className="user-editor-summary"><Avatar value={record.avatarUrl ?? ""} name={record.displayName} className="user-editor-avatar" /><div><strong>{record.displayName}</strong><span>@{record.username} · {roleLabels[record.role]}</span><small>{record.isBot ? "Бот" : record.isGuest ? "Гость" : "Зарегистрированный пользователь"} · в чате с {new Date(record.createdAt).toLocaleDateString("ru-RU")}</small></div></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="user-editor-notice" role="status">{notice}</p>}
      {!record && !error && <p className="user-editor-hint">Загружаем данные пользователя…</p>}
      {record && section === "profile" && <section className="user-editor-card"><h3>Информация профиля</h3><p>Пустые поля можно заполнить, существующие — изменить.</p><div className="user-editor-fields"><label>Логин<input disabled={!isAdmin || busy} value={draft.username ?? ""} maxLength={32} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /></label><label>Отображаемое имя<input disabled={!isAdmin || busy} value={draft.displayName ?? ""} maxLength={64} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label className="wide">О себе<textarea disabled={!isAdmin || busy} value={draft.bio ?? ""} rows={5} maxLength={500} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /></label><label>Пол<StyledSelect disabled={!isAdmin || busy} value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value as EditableUser["gender"] })}><option value="unspecified">Не указан</option><option value="male">Парень</option><option value="female">Девушка</option></StyledSelect></label>{isAdmin && (draft.role === "admin" || draft.role === "moderator") && <label className="profile-role-visibility wide"><input type="checkbox" checked={Boolean(draft.hideRole)} disabled={busy} onChange={(event) => setDraft({ ...draft, hideRole: event.target.checked })} /><span><strong>Скрывать роль</strong><small>Не показывать другим участникам, что пользователь администратор или модератор.</small></span></label>}</div><div className="user-editor-photo"><Avatar value={record.avatarUrl ?? ""} name={record.displayName} className="user-editor-avatar" /><div><strong>Аватар</strong><small>PNG, JPEG или WebP, до 10 МБ</small></div>{isAdmin && <><AvatarPicker className="user-editor-upload" label="Загрузить" disabled={busy} onSelected={upload} />{record.avatarUrl && <button type="button" className="action-button secondary" disabled={busy} onClick={() => void removeAvatar()}>Удалить фото</button>}</>}</div>{isAdmin && <footer><button className="action-button" type="button" disabled={busy} onClick={() => void save(["username","displayName","bio","gender","hideRole"])}><Save size={15} />Сохранить профиль</button></footer>}</section>}
      {record && section === "economy" && <section className="user-editor-card"><h3>Рейтинг и кредиты</h3><p>Баланс: <b>{record.credits} кредитов</b>. Каждая операция фиксируется с причиной; отрицательный баланс запрещён.</p><div className="user-editor-fields"><label>Рейтинг<input type="number" min={0} max={2147483647} disabled={busy} value={draft.rating ?? 0} onChange={event => setDraft({ ...draft, rating: event.target.valueAsNumber })} /></label></div><button className="action-button secondary" disabled={busy} onClick={() => void save(["rating"])}>Сохранить рейтинг</button><div className="user-editor-fields"><label>Операция<StyledSelect value={creditMode} onChange={event => setCreditMode(event.target.value as typeof creditMode)}><option value="add">Начислить</option><option value="remove">Списать</option><option value="set">Установить баланс</option></StyledSelect></label><label>Количество<input type="number" min={0} max={2147483647} value={creditAmount} onChange={event => setCreditAmount(event.target.valueAsNumber)} /></label><label className="wide">Причина<input value={creditReason} maxLength={500} onChange={event => setCreditReason(event.target.value)} /></label></div><button className="action-button" disabled={busy || creditReason.trim().length < 2 || !Number.isInteger(creditAmount) || creditAmount < 0} onClick={() => void adjustCredits()}>Применить операцию</button><AdminEconomyLedger key={record.credits} userId={record.id} /></section>}
      {record && section === "appearance" && <section className="user-editor-card"><h3>Оформление и VIP</h3><p>Выдача бессрочная, без списания кредитов. Пользователь настраивает выданные эффекты в своём профиле. Повторная выдача не сбрасывает настройки.</p><p>Доступно: {(record.cosmetics ?? []).map(item => item.effectKey).join(", ") || "ничего"}</p><div className="user-editor-fields"><label>Эффект<StyledSelect value={cosmetic} onChange={event => setCosmetic(event.target.value)}>{Object.entries({ vip: "VIP", avatarFrame: "Рамка аватара", profileCover: "Обложка профиля", customStatus: "Личный статус", colorNick: "Цвет ника", gradientNick: "Градиент ника", pictureNick: "Ник с картинкой", messageColor: "Цвет сообщений", gradientText: "Градиент сообщений", boldText: "Жирный текст", italicText: "Курсив" }).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</StyledSelect></label><label>Причина<input maxLength={500} value={cosmeticReason} onChange={event => setCosmeticReason(event.target.value)} /></label></div><div className="admin-shortcuts"><button disabled={busy || cosmeticReason.trim().length < 2} onClick={() => void changeCosmetic("grant")}>Выдать</button><button disabled={busy || cosmeticReason.trim().length < 2} onClick={() => void changeCosmetic("revoke")}>Отозвать</button></div></section>}
      {record && section === "access" && <section className="user-editor-card"><h3>Доступ и аккаунт</h3>{isAdmin && <label className="radio-dj-toggle"><input type="checkbox" checked={record.isDj} disabled={busy} onChange={async event => { const enabled = event.target.checked; setBusy(true); setError(""); try { await setRadioDj(record.id, enabled); load(await fetchEditableUser(record.id)); onChanged(); setNotice("Права DJ обновлены."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить права DJ"); } finally { setBusy(false); } }} />DJ — музыкальный эфир, без полномочий модератора</label>}<p>При изменении роли действующие сеансы пользователя завершатся.</p><div className="user-editor-fields"><label>Роль<StyledSelect disabled={!isAdmin || busy} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as EditableUser["role"] })}><option value="user">Участник</option><option value="moderator">Модератор</option><option value="admin">Администратор</option></StyledSelect></label><label>Текущий статус<input value={record.status === "online" ? "В сети" : record.status === "dnd" ? "Не беспокоить" : record.status === "away" ? "Отошёл" : "Не в сети"} disabled /></label></div><div className="user-editor-stats"><span>Сообщений: <b>{record._count.messages}</b></span><span>Записей: <b>{record._count.profilePosts}</b></span><span>Жалоб: <b>{record._count.reportsReceived}</b></span></div>{isAdmin && <footer><button className="action-button" type="button" disabled={busy} onClick={() => void save(["role"])}><Save size={15} />Сохранить роль</button></footer>}<button type="button" className="action-button secondary" disabled={busy || record.role === "admin"} onClick={() => void revokeSessions()}>Завершить все сеансы пользователя</button><div className="user-editor-danger"><div><strong>Отключить аккаунт</strong><p>Вход станет недоступен, все сеансы завершатся. Сообщения и связанные данные останутся в базе.</p></div><button type="button" disabled={!isAdmin || busy || record.id === actor.id || record.role === "admin"} onClick={() => void deactivate()}><Trash2 size={15} />Отключить</button></div></section>}
      {record && section === "moderation" && <section className="user-editor-card"><h3>Ограничения пользователя</h3><p>Запрет отправки и «Хаос» доступны модераторам. «Хаос» оставляет приват, но закрывает общий чат, комментарии и траты кредитов. Блокировка аккаунта доступна администраторам.</p><div className="user-editor-fields"><label>Срок ограничения<StyledSelect value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={15}>15 минут</option><option value={60}>1 час</option><option value={1440}>1 день</option><option value={10080}>7 дней</option></StyledSelect></label><label className="wide">Причина<input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Необязательно" /></label></div><div className="user-editor-moderation-actions"><button type="button" disabled={busy || record.role === "admin"} onClick={() => void moderate("mute")}><VolumeX size={15} />Запретить отправку</button><button type="button" disabled={busy} onClick={() => void moderate("unmute")}><Volume2 size={15} />Снять запрет</button><button type="button" disabled={busy || record.role === "admin"} onClick={() => void moderate("chaos")}><Ban size={15} />Хаос</button><button type="button" disabled={busy} onClick={() => void moderate("unchaos")}><Shield size={15} />Снять Хаос</button>{isAdmin && <><button type="button" disabled={busy || record.role === "admin"} onClick={() => void moderate("ban")}><Ban size={15} />Заблокировать</button><button type="button" disabled={busy} onClick={() => void moderate("unban")}><Shield size={15} />Разблокировать</button></>}</div></section>}
    </div>
  </section>;
}

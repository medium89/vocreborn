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
    setDraft({ username: next.username, displayName: next.displayName, bio: next.bio ?? "", gender: next.gender, role: next.role, hideRole: next.hideRole, hideDj: next.hideDj, participantBadges: next.participantBadges, rating: next.rating, credits: next.credits });
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
      <button type="button" className="action-button secondary user-editor-back" onClick={onBack}><ArrowLeft size={15} />{backLabel}</button>
    </header>

    <nav className="user-editor-tabs" aria-label="Разделы редактирования">
      {tabItems.map(({ id, label, icon: Icon }) => <button
        type="button"
        key={id}
        className={"user-editor-pill" + (section === id ? " active" : "")}
        aria-current={section === id ? "page" : undefined}
        onClick={() => { setSection(id); setError(""); setNotice(""); }}
      ><Icon size={14} />{label}</button>)}
    </nav>

    <div className="user-editor-scroll">
      {record && <div className="user-editor-summary">
        <Avatar value={record.avatarUrl ?? ""} name={record.displayName} className="user-editor-avatar" />
        <div>
          <strong>{record.displayName}</strong>
          <span>@{record.username} · {roleLabels[record.role]}</span>
          <small>{record.isBot ? "Бот" : record.isGuest ? "Гость" : "Зарегистрированный пользователь"} · в чате с {new Date(record.createdAt).toLocaleDateString("ru-RU")}</small>
        </div>
      </div>}

      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="user-editor-notice" role="status">{notice}</p>}
      {!record && !error && <p className="user-editor-hint">Загружаем данные пользователя...</p>}

      {record && section === "profile" && <section className="user-editor-card">
        <div className="user-editor-card-head">
          <h3>Информация профиля</h3>
          <p>Основные данные, публичная информация и аватар пользователя.</p>
        </div>

        <div className="user-editor-fields">
          <label>Логин
            <input disabled={!isAdmin || busy} value={draft.username ?? ""} maxLength={32} onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
          </label>
          <label>Отображаемое имя
            <input disabled={!isAdmin || busy} value={draft.displayName ?? ""} maxLength={64} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />
          </label>
          <label className="wide">О себе
            <textarea disabled={!isAdmin || busy} value={draft.bio ?? ""} rows={5} maxLength={500} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} />
          </label>
          <label>Пол
            <StyledSelect disabled={!isAdmin || busy} value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value as EditableUser["gender"] })}>
              <option value="unspecified">Не указан</option><option value="male">Парень</option><option value="female">Девушка</option>
            </StyledSelect>
          </label>
          <div className="wide badge-tiles"><div className="badge-tiles-head"><strong>Статус-плашки</strong><button type="button" className="action-button secondary" disabled={!isAdmin || busy || (draft.participantBadges?.length ?? 0) >= 12} onClick={() => setDraft({ ...draft, participantBadges: [...(draft.participantBadges ?? []), { id: crypto.randomUUID(), label: "", icon: "", outlined: true, backgroundColor: "", borderColor: "" }] })}>Добавить плашку</button></div>
            {(draft.participantBadges ?? []).map((badge, index) => <article className="badge-tile" key={badge.id}>
              <div className="badge-tile-head"><strong>Плашка {index + 1}</strong><button type="button" className="action-button secondary" disabled={!isAdmin || busy} onClick={() => setDraft({ ...draft, participantBadges: (draft.participantBadges ?? []).filter((item) => item.id !== badge.id) })}><Trash2 size={14} />Удалить</button></div>
              <label>Текст<input disabled={!isAdmin || busy} value={badge.label} maxLength={48} placeholder="Например, Организатор" onChange={(event) => setDraft({ ...draft, participantBadges: (draft.participantBadges ?? []).map((item) => item.id === badge.id ? { ...item, label: event.target.value } : item) })} /></label><label>Значок<input disabled={!isAdmin || busy} value={badge.icon} maxLength={16} placeholder="⭐" onChange={(event) => setDraft({ ...draft, participantBadges: (draft.participantBadges ?? []).map((item) => item.id === badge.id ? { ...item, icon: event.target.value } : item) })} /></label>
              <label>Фон<input type="color" disabled={!isAdmin || busy} value={badge.backgroundColor || "#f1f8e9"} onChange={(event) => setDraft({ ...draft, participantBadges: (draft.participantBadges ?? []).map((item) => item.id === badge.id ? { ...item, backgroundColor: event.target.value } : item) })} /></label><label>Рамка<input type="color" disabled={!isAdmin || busy} value={badge.borderColor || "#648239"} onChange={(event) => setDraft({ ...draft, participantBadges: (draft.participantBadges ?? []).map((item) => item.id === badge.id ? { ...item, borderColor: event.target.value } : item) })} /></label>
              <label className="profile-role-visibility"><input type="checkbox" checked={badge.outlined} disabled={!isAdmin || busy} onChange={(event) => setDraft({ ...draft, participantBadges: (draft.participantBadges ?? []).map((item) => item.id === badge.id ? { ...item, outlined: event.target.checked } : item) })} /><span><strong>Обводка</strong><small>Показывать рамку.</small></span></label>
            </article>)}
          </div>
          {isAdmin && (draft.role === "admin" || draft.role === "moderator") && <label className="profile-role-visibility wide">
            <input type="checkbox" checked={Boolean(draft.hideRole)} disabled={busy} onChange={(event) => setDraft({ ...draft, hideRole: event.target.checked })} />
            <span><strong>Скрывать статус администратора / модератора</strong><small>Не показывать другим участникам административную или модераторскую роль.</small></span>
          </label>}
          {isAdmin && record.isDj && <label className="profile-role-visibility wide">
            <input type="checkbox" checked={Boolean(draft.hideDj)} disabled={busy} onChange={(event) => setDraft({ ...draft, hideDj: event.target.checked })} />
            <span><strong>Скрывать статус DJ</strong><small>Не показывать другим участникам значок и статус DJ. Права на радио сохраняются.</small></span>
          </label>}
        </div>

        <div className="user-editor-photo">
          <Avatar value={record.avatarUrl ?? ""} name={record.displayName} className="user-editor-avatar" />
          <div><strong>Аватар</strong><small>PNG, JPEG или WebP, до 10 МБ</small></div>
          {isAdmin && <div className="user-editor-photo-actions">
            <AvatarPicker className="user-editor-upload" label="Загрузить" disabled={busy} onSelected={upload} />
            {record.avatarUrl && <button type="button" className="action-button secondary" disabled={busy} onClick={() => void removeAvatar()}>Удалить фото</button>}
          </div>}
        </div>

        {isAdmin && <div className="user-editor-actions">
          <button className="action-button" type="button" disabled={busy} onClick={() => void save(["username","displayName","bio","gender","hideRole","hideDj","participantBadges"])}><Save size={15} />Сохранить профиль</button>
        </div>}
      </section>}

      {record && section === "economy" && <section className="user-editor-card">
        <div className="user-editor-card-head">
          <h3>Рейтинг и кредиты</h3>
          <p>Управление рейтингом и балансом. Все операции с кредитами записываются в журнал.</p>
        </div>

        <div className="user-editor-subsection">
          <div className="user-editor-subsection-head">
            <h4>Рейтинг</h4>
            <p>Текущее значение можно заменить вручную.</p>
          </div>
          <div className="user-editor-fields user-editor-fields-compact">
            <label>Рейтинг
              <input type="number" min={0} max={2147483647} disabled={busy} value={draft.rating ?? 0} onChange={event => setDraft({ ...draft, rating: event.target.valueAsNumber })} />
            </label>
          </div>
          <div className="user-editor-actions">
            <button className="action-button" type="button" disabled={busy} onClick={() => void save(["rating"])}><Save size={15} />Сохранить рейтинг</button>
          </div>
        </div>

        <div className="user-editor-subsection">
          <div className="user-editor-subsection-head">
            <h4>Кредиты</h4>
            <p>Сейчас на балансе <b>{record.credits}</b>. Отрицательный баланс запрещён.</p>
          </div>
          <div className="user-editor-fields">
            <label>Операция
              <StyledSelect disabled={busy} value={creditMode} onChange={event => setCreditMode(event.target.value as typeof creditMode)}>
                <option value="add">Начислить</option><option value="remove">Списать</option><option value="set">Установить баланс</option>
              </StyledSelect>
            </label>
            <label>Количество
              <input disabled={busy} type="number" min={0} max={2147483647} value={creditAmount} onChange={event => setCreditAmount(event.target.valueAsNumber)} />
            </label>
            <label className="wide">Причина
              <input disabled={busy} value={creditReason} maxLength={500} placeholder="Например: приз за викторину" onChange={event => setCreditReason(event.target.value)} />
            </label>
          </div>
          <div className="user-editor-actions">
            <button className="action-button" type="button" disabled={busy || creditReason.trim().length < 2 || !Number.isInteger(creditAmount) || creditAmount < 0} onClick={() => void adjustCredits()}>Применить операцию</button>
          </div>
        </div>

        <div className="user-editor-subsection user-editor-ledger-section">
          <div className="user-editor-subsection-head">
            <h4>История операций</h4>
            <p>Последние изменения баланса пользователя.</p>
          </div>
          <AdminEconomyLedger key={record.credits} userId={record.id} />
        </div>
      </section>}

      {record && section === "appearance" && <section className="user-editor-card">
        <div className="user-editor-card-head">
          <h3>Оформление и VIP</h3>
          <p>Выданные эффекты бессрочные и не списывают кредиты. Пользователь настраивает их в своём профиле.</p>
        </div>

        <div className="user-editor-meta-line">
          <span>Сейчас доступно</span>
          <strong>{(record.cosmetics ?? []).map(item => item.effectKey).join(", ") || "Ничего"}</strong>
        </div>

        <div className="user-editor-fields">
          <label>Эффект
            <StyledSelect disabled={busy} value={cosmetic} onChange={event => setCosmetic(event.target.value)}>
              {Object.entries({ vip: "VIP", avatarFrame: "Рамка аватара", profileCover: "Обложка профиля", customStatus: "Личный статус", colorNick: "Цвет ника", gradientNick: "Градиент ника", pictureNick: "Ник с картинкой", messageColor: "Цвет сообщений", gradientText: "Градиент сообщений", boldText: "Жирный текст", italicText: "Курсив" }).map(([key,label]) => <option value={key} key={key}>{label}</option>)}
            </StyledSelect>
          </label>
          <label>Причина
            <input disabled={busy} maxLength={500} value={cosmeticReason} placeholder="Почему выдаём или отзываем" onChange={event => setCosmeticReason(event.target.value)} />
          </label>
        </div>

        <div className="user-editor-actions">
          <button type="button" className="action-button secondary" disabled={busy || cosmeticReason.trim().length < 2} onClick={() => void changeCosmetic("revoke")}>Отозвать</button>
          <button type="button" className="action-button" disabled={busy || cosmeticReason.trim().length < 2} onClick={() => void changeCosmetic("grant")}>Выдать</button>
        </div>
      </section>}

      {record && section === "access" && <section className="user-editor-card">
        <div className="user-editor-card-head">
          <h3>Доступ и аккаунт</h3>
          <p>Роль, активные сеансы и дополнительные права пользователя.</p>
        </div>

        {isAdmin && <div className="user-editor-subsection user-editor-subsection-first">
          <div className="user-editor-subsection-head">
            <h4>Права DJ</h4>
            <p>Доступ к музыкальному эфиру без полномочий модератора.</p>
          </div>
          <label className="radio-dj-toggle">
            <input type="checkbox" checked={record.isDj} disabled={busy} onChange={async event => {
              const enabled = event.target.checked; setBusy(true); setError("");
              try { await setRadioDj(record.id, enabled); load(await fetchEditableUser(record.id)); onChanged(); setNotice("Права DJ обновлены."); }
              catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить права DJ"); }
              finally { setBusy(false); }
            }} />
            <span>{record.isDj ? "DJ-доступ включён" : "DJ-доступ выключен"}</span>
          </label>
        </div>}

        <div className="user-editor-subsection">
          <div className="user-editor-subsection-head">
            <h4>Роль и сеансы</h4>
            <p>При изменении роли действующие сеансы пользователя завершатся.</p>
          </div>
          <div className="user-editor-fields">
            <label>Роль
              <StyledSelect disabled={!isAdmin || busy} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as EditableUser["role"] })}>
                <option value="user">Участник</option><option value="moderator">Модератор</option><option value="admin">Администратор</option>
              </StyledSelect>
            </label>
            <label>Текущий статус
              <input value={record.status === "online" ? "В сети" : record.status === "dnd" ? "Не беспокоить" : record.status === "away" ? "Отошёл" : "Не в сети"} disabled />
            </label>
          </div>

          <div className="user-editor-stats">
            <span>Сообщений: <b>{record._count.messages}</b></span>
            <span>Записей: <b>{record._count.profilePosts}</b></span>
            <span>Жалоб: <b>{record._count.reportsReceived}</b></span>
          </div>

          <div className="user-editor-actions">
            <button type="button" className="action-button secondary" disabled={busy || record.role === "admin"} onClick={() => void revokeSessions()}>Завершить все сеансы</button>
            {isAdmin && <button className="action-button" type="button" disabled={busy} onClick={() => void save(["role"])}><Save size={15} />Сохранить роль</button>}
          </div>
        </div>

        <div className="user-editor-danger">
          <div><strong>Отключить аккаунт</strong><p>Вход станет недоступен, все сеансы завершатся. Сообщения и связанные данные останутся в базе.</p></div>
          <button type="button" disabled={!isAdmin || busy || record.id === actor.id || record.role === "admin"} onClick={() => void deactivate()}><Trash2 size={15} />Отключить</button>
        </div>
      </section>}

      {record && section === "moderation" && <section className="user-editor-card">
        <div className="user-editor-card-head">
          <h3>Ограничения пользователя</h3>
          <p>Выберите срок и при необходимости укажите причину. Затем примените нужное действие.</p>
        </div>

        <div className="user-editor-fields">
          <label>Срок ограничения
            <StyledSelect disabled={busy} value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              <option value={15}>15 минут</option><option value={60}>1 час</option><option value={1440}>1 день</option><option value={10080}>7 дней</option>
            </StyledSelect>
          </label>
          <label>Причина
            <input disabled={busy} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Необязательно" />
          </label>
        </div>

        <div className="user-editor-moderation-grid">
          <div className="user-editor-moderation-group">
            <div><strong>Отправка сообщений</strong><p>Запретить пользователю писать или снять ограничение.</p></div>
            <div className="user-editor-actions">
              <button type="button" className="action-button secondary" disabled={busy || record.role === "admin"} onClick={() => void moderate("mute")}><VolumeX size={15} />Запретить</button>
              <button type="button" className="action-button secondary" disabled={busy} onClick={() => void moderate("unmute")}><Volume2 size={15} />Снять запрет</button>
            </div>
          </div>

          <div className="user-editor-moderation-group">
            <div><strong>Режим «Хаос»</strong><p>Приват остаётся доступен, общий чат, комментарии и траты кредитов закрываются.</p></div>
            <div className="user-editor-actions">
              <button type="button" className="action-button secondary" disabled={busy || record.role === "admin"} onClick={() => void moderate("chaos")}><Ban size={15} />Включить</button>
              <button type="button" className="action-button secondary" disabled={busy} onClick={() => void moderate("unchaos")}><Shield size={15} />Снять Хаос</button>
            </div>
          </div>

          {isAdmin && <div className="user-editor-moderation-group is-danger">
            <div><strong>Блокировка аккаунта</strong><p>Полностью заблокировать доступ пользователя или снять блокировку.</p></div>
            <div className="user-editor-actions">
              <button type="button" className="action-button user-editor-danger-button" disabled={busy || record.role === "admin"} onClick={() => void moderate("ban")}><Ban size={15} />Заблокировать</button>
              <button type="button" className="action-button secondary" disabled={busy} onClick={() => void moderate("unban")}><Shield size={15} />Разблокировать</button>
            </div>
          </div>}
        </div>
      </section>}
    </div>
  </section>;
}

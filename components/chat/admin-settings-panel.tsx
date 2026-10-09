"use client";
import { useEffect, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { adminRequest, type ChatSettings, type SettingsRecord } from "@/lib/admin-api";

const fields: Record<keyof ChatSettings, { label: string; hint: string; min?: number; max?: number; scale?: number; step?: number }> = {
  registrationOpen: { label: "Регистрация открыта", hint: "Закрывает только создание новых аккаунтов. Уже зарегистрированные пользователи могут входить." },
  allowUserRooms: { label: "Пользователи могут создавать комнаты", hint: "Администраторы сохраняют это право при любом значении." },
  maintenance: { label: "Режим обслуживания", hint: "Закрывает регистрацию и отправку сообщений обычными пользователями. Администрация продолжает писать. Чтение доступно." },
  allowLinks: { label: "Разрешить ссылки в сообщениях", hint: "Проверка ссылок http, https и www в общем чате и личке. Для администрации действует исключение." },
  maxMessageLength: { label: "Максимум символов в сообщении", hint: "Общий чат и личка, включая отправку через API и WebSocket.", min: 10, max: 1000 },
  slowModeSeconds: { label: "Пауза между сообщениями, секунд", hint: "Для обычных пользователей в одной комнате. 0 — без паузы; личку не ограничивает.", min: 0, max: 3600 },
  imageMaxMb: { label: "Лимит изображений в чате, МБ", hint: "Только новые вложения. Аватары и фотографии альбомов имеют свои ограничения.", min: 1, max: 20 },
  audioMaxMb: { label: "Лимит аудио в чате, МБ", hint: "Не меняет отдельный лимит треков радио (25 МБ).", min: 1, max: 8 },
  initialCredits: { label: "Кредиты при регистрации", hint: "Только для новых зарегистрированных аккаунтов; текущие балансы не меняются.", min: 0, max: 100000 },
  firstMessageReward: { label: "Первое сообщение за день", hint: "За текст от трёх символов в общем чате. 0 отключает награду.", min: 0, max: 1000 },
  firstReplyReward: { label: "Первый ответ другому пользователю", hint: "Один раз в сутки. Ответ самому себе не учитывается.", min: 0, max: 1000 },
  profileCommentReward: { label: "Комментарий в профиле", hint: "Ежедневная награда за участие.", min: 0, max: 1000 },
  photoLikeReward: { label: "Лайк фотографии", hint: "Ежедневная награда, не за каждый лайк.", min: 0, max: 1000 },
  profilePostLikeReward: { label: "Лайк записи профиля", hint: "Ежедневная награда. День считается по UTC; 0 отключает награду.", min: 0, max: 1000 },
  videoQueuePrice: { label: "Добавление видео в очередь", hint: "Цена одного добавления в видеокомнате. 0 - бесплатно. Списывается при постановке ролика в очередь.", min: 0, max: 100000 },
  casinoEnabled: { label: "Казино открыто", hint: "Если выключить, новые ставки будут недоступны." },
  casinoMinBet: { label: "Минимальная ставка", hint: "Не больше максимальной ставки.", min: 1, max: 100000 },
  casinoMaxBet: { label: "Максимальная ставка", hint: "Также ограничена текущим балансом игрока.", min: 1, max: 100000 },
  casinoRedBlackPayoutBps: { label: "Выплата за красное / чёрное, x", hint: "Общая выплата включает ставку. По умолчанию x1,86.", min: 10000, max: 30000, scale: 10000, step: 0.01 },
  casinoGreenPayoutBps: { label: "Выплата за зелёное, x", hint: "Общая выплата включает ставку. По умолчанию x33,48.", min: 10000, max: 500000, scale: 10000, step: 0.01 },
  casinoJackpotBasePerMillion: { label: "Базовый шанс джекпота, %", hint: "0,1% = один выигрыш примерно на 1000 прокрутов.", min: 0, max: 100000, scale: 10000, step: 0.0001 },
  casinoJackpotGrowthPer10000PerMillion: { label: "Рост шанса на каждые 10 000 кредитов, %", hint: "По умолчанию +0,005 процентного пункта на каждые 10 000 кредитов в банке.", min: 0, max: 10000, scale: 10000, step: 0.0001 },
  casinoJackpotMaxPerMillion: { label: "Потолок шанса джекпота, %", hint: "По умолчанию 0,5% — максимум один выигрыш примерно на 200 прокрутов.", min: 0, max: 100000, scale: 10000, step: 0.0001 },
};
export function AdminSettingsPanel({ title, keys }: { title: string; keys: Array<keyof ChatSettings> }) {
  const [record, setRecord] = useState<SettingsRecord | null>(null);
  const [draft, setDraft] = useState<ChatSettings | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { const next = await adminRequest<SettingsRecord>("settings"); setRecord(next); setDraft(next.settings); setNotice(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const changed = draft && record ? Object.fromEntries(keys.filter(key => draft[key] !== record.settings[key]).map(key => [key, draft[key]])) : {};
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!record || !draft) return;
    setBusy(true); setError(""); setNotice("");
    try { const next = await adminRequest<SettingsRecord>("settings", { settings: changed, version: record.version, reason: reason.trim() }); setRecord(next); setDraft(next.settings); setReason(""); setNotice("Сохранено. Настройки применяются на сервере без перезапуска."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки"); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel"><header><h3>{title}</h3><button type="button" disabled={busy} onClick={() => { if (!Object.keys(changed).length || window.confirm("Обновить настройки и отменить несохранённые изменения?")) void load(); }}><RefreshCw className="admin-refresh-icon" size={15} />Обновить</button></header>
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p role="status" className="user-editor-notice">{notice}</p>}
    {!draft ? <p>Загрузка настроек…</p> : <form onSubmit={save}><div className="admin-settings-grid">{keys.map(key => {
      const field = fields[key];
      const isToggle = typeof draft[key] === "boolean";
      return <label key={key} className={isToggle ? `admin-setting-toggle${draft[key] ? " is-enabled" : ""}` : ""}>{isToggle ? <><span className="admin-setting-toggle-head"><span>{field.label}</span><span className="admin-setting-toggle-control"><input type="checkbox" checked={draft[key] as boolean} disabled={busy} onChange={event => setDraft({ ...draft, [key]: event.target.checked })} /><span>{draft[key] ? "Включено" : "Выключено"}</span></span></span><small>{field.hint}</small></> : <><span>{field.label}</span><input type="number" required min={field.min === undefined ? undefined : field.min / (field.scale ?? 1)} max={field.max === undefined ? undefined : field.max / (field.scale ?? 1)} step={field.step ?? 1} disabled={busy} value={(draft[key] as number) / (field.scale ?? 1)} onChange={event => setDraft({ ...draft, [key]: Math.round(event.target.valueAsNumber * (field.scale ?? 1)) })} /><small>{field.hint}</small></>}</label>;
    })}</div><label className="admin-operation-reason">Причина изменения<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Например: уменьшили паузу после тестирования" /></label><button className="action-button" disabled={busy || !reason.trim() || !Object.keys(changed).length}><Save size={15} />Сохранить настройки</button></form>}
  </section>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Headphones, Music2, RefreshCw, Upload } from "lucide-react";
import type { AuthUser } from "@/lib/chat-contract";
import { API_URL } from "@/lib/chat-api";
import { getRadioStatus, radioLabels, radioRequest, uploadRadioAudio, type RadioOrder, type RadioStatus } from "@/lib/radio-api";
import { BackToChatButton } from "./back-to-chat-button";

const pending = (row: RadioOrder) => ["WAITING", "ACCEPTED"].includes(row.status);
export function RadioPage({ user, mode, onMode, onBack, onBalance }: { user: AuthUser; mode: "requests" | "studio"; onMode: (mode: "requests" | "studio") => void; onBack: () => void; onBalance: (balance: { credits: number; rating: number }) => void }) {
  const [state, setState] = useState<RadioStatus | null>(null);
  const [orders, setOrders] = useState<RadioOrder[]>([]);
  const [queue, setQueue] = useState<RadioOrder[]>([]);
  const [artist, setArtist] = useState(""); const [title, setTitle] = useState(""); const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [price, setPrice] = useState(5);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const previewRef = useRef<HTMLAudioElement>(null);
  const key = useRef<string | null>(null);
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const mounted = useRef(true);
  const modeRef = useRef(mode); modeRef.current = mode;
  const fileInput = useRef<HTMLInputElement>(null);
  const canDj = user.isDj || user.role === "admin";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => { setPreview(null); }, [mode]);
  async function refresh() {
    try {
      const requestedMode = mode;
      const next = await getRadioStatus(); if (!mounted.current || modeRef.current !== requestedMode) return; setState(next);
      if (!next.enabled) return;
      if (mode === "studio") {
        const rows = await radioRequest<RadioOrder[]>("/studio"); if (mounted.current && modeRef.current === requestedMode) setOrders(rows);
      } else {
        const [mine, publicQueue] = await Promise.all([radioRequest<{ orders: RadioOrder[]; balance: { credits: number; rating: number } }>("/requests/mine"), radioRequest<RadioOrder[]>("/requests/queue")]);
        if (mounted.current && modeRef.current === requestedMode) { setOrders(mine.orders); setQueue(publicQueue); onBalance(mine.balance); }
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Не удалось обновить радио"); }
  }
  useEffect(() => { if (state) setPrice(state.price); }, [state?.price]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [mode, user.id]);
  async function action(run: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try { await run(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выполнить действие"); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await action(async () => {
      key.current ??= crypto.randomUUID();
      let uploadId: string | undefined;
      if (file) {
        if (uploaded.current?.file !== file) uploaded.current = { file, id: (await uploadRadioAudio(file)).id };
        uploadId = uploaded.current!.id;
      }
      await radioRequest("/requests", { artist, title, note, uploadId, idempotencyKey: key.current, expectedPrice: state?.price ?? 5, studio: mode === "studio" });
      key.current = null; uploaded.current = null; setArtist(""); setTitle(""); setNote(""); setFile(null); if (fileInput.current) fileInput.current.value = "";
      setNotice(mode === "studio" ? "Трек добавлен в плейлист; он прозвучит после текущего." : "Заказ отправлен DJ. Кредиты зарезервированы; при отмене или неисполнении они вернутся.");
    });
  }
  async function openAudio(row: RadioOrder, download: boolean) {
    if (!row.upload) return;
    const response = await fetch(API_URL + "/api/radio/uploads/" + row.upload.id, { credentials: "include" });
    if (!response.ok) throw new Error("Аудиофайл недоступен или истёк срок хранения");
    const url = URL.createObjectURL(await response.blob());
    if (download) { const link = document.createElement("a"); link.href = url; link.download = row.upload.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
    else { previewRef.current?.pause(); setPreview({ id: row.id, url }); }
  }
  const isHost = state?.host?.id === user.id;
  const formAllowed = state?.enabled && (mode === "studio" ? isHost : state.accepting);
  return <section className="management-module radio-page">
    <header className="management-module-head"><div className="page-heading"><span className="page-heading-icon radio-heading-icon"><Headphones size={20} /></span><div><span className="eyebrow">TUSOVA RADIO</span><h2>{mode === "studio" ? "Студия DJ" : "Заказать песню"}</h2></div></div><BackToChatButton onClick={onBack} /></header>
    <div className="management-module-body radio-page-body">
      <nav className="radio-tabs"><button type="button" className={mode === "requests" ? "active" : ""} onClick={() => onMode("requests")}>Заказы песен</button>{canDj && <button type="button" className={mode === "studio" ? "active" : ""} onClick={() => onMode("studio")}>Студия DJ</button>}<button type="button" title="Обновить радио" onClick={() => void refresh()}><RefreshCw size={16} /></button></nav>
      {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="radio-notice" role="status">{notice}</p>}
      {!state ? <p>Подключаемся к радио…</p> : !state.enabled ? <p className="radio-notice">Радио ещё не подключено. Администратор должен запустить аудиосервис.</p> : <>
      <section className="radio-card"><h3>{state.live ? "Эфир идёт" : "Эфир офлайн"}</h3><p>{state.host ? "Ведущий: " + state.host.displayName : "Сейчас ведущего нет"}. Заказ — {state.price} кредитов.</p><p>При отмене, отклонении, истечении часа ожидания или обрыве эфира резерв возвращается. Заработок DJ в этой версии не начисляется.</p>
      {mode === "studio" && canDj && <div className="radio-actions">
        {!state.host && <button type="button" className="action-button" disabled={busy} onClick={() => void action(() => radioRequest("/start", {}))}>Начать эфир</button>}
        {(isHost || user.role === "admin" && state.host) && <button type="button" className="action-button secondary" disabled={busy} onClick={() => void action(() => radioRequest("/stop", {}))}>Завершить эфир и вернуть резервы</button>}
        {isHost && <><button type="button" className="action-button secondary" disabled={busy} onClick={() => void action(() => radioRequest("/settings", { accepting: !state.accepting }, "PATCH"))}>{state.accepting ? "Закрыть заказы" : "Открыть заказы"}</button><button type="button" className="action-button secondary" disabled={busy || !state.track} onClick={() => void action(() => radioRequest("/skip", {}))}>Следующий трек</button></>}
      </div>}
      {mode === "studio" && user.role === "admin" && <form className="radio-price" onSubmit={event => { event.preventDefault(); void action(() => radioRequest("/settings", { price }, "PATCH")); }}><label>Цена заказа<input type="number" min={1} max={10000} value={price} onChange={event => setPrice(Number(event.target.value))} /></label><button type="submit" className="action-button secondary" disabled={busy}>Сохранить цену</button></form>}
      </section>
      {(mode === "requests" || canDj) && <form className="radio-card radio-request-form" onSubmit={submit}><h3>{mode === "studio" ? "Добавить трек в эфир" : "Ваша песня для тусовы"}</h3><label>Исполнитель<input value={artist} maxLength={120} required disabled={busy} onChange={event => { setArtist(event.target.value); key.current = null; }} /></label><label>Название песни<input value={title} maxLength={160} required disabled={busy} onChange={event => { setTitle(event.target.value); key.current = null; }} /></label>{mode === "requests" && <label>Пожелание или посвящение<textarea rows={3} value={note} maxLength={500} disabled={busy} onChange={event => { setNote(event.target.value); key.current = null; }} /></label>}<label className="radio-file-label"><Upload size={17} />{file?.name ?? (mode === "studio" ? "Выберите аудиофайл" : "Прикрепить трек — необязательно")}<input type="file" accept="audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.flac,.ogg,.m4a,.webm" disabled={busy} ref={fileInput} onChange={event => { setFile(event.target.files?.[0] ?? null); uploaded.current = null; key.current = null; }} /></label><small>До 25 МБ и 15 минут. Файл хранится один час после загрузки, доступен вам и DJ; после срока удаляется. Загружайте только аудио, которое вправе передавать в эфир.</small>{mode === "requests" && !state.accepting && <p>DJ пока не принимает заказы. Можно заполнить форму и отправить, когда приём откроется.</p>}<button className="action-button" disabled={busy || !formAllowed || mode === "studio" && !file}>{busy ? "Подождите…" : mode === "studio" ? "Добавить в плейлист" : "Заказать за " + state.price + " кредитов"}</button></form>}
      <section className="radio-card"><h3>{mode === "studio" ? "Заказы и плейлист" : "Мои заказы"}</h3>{orders.length === 0 && <p>Пока нет заказов.</p>}<div className="radio-orders">{orders.map(row => <article key={row.id}>
        <header><strong>{row.artist} — {row.title}</strong><span className={"radio-status radio-status-" + row.status.toLowerCase()}>{radioLabels[row.status]}</span></header>
        <small>{mode === "studio" && (row.user?.displayName + " · ")}{row.studio ? "Плейлист DJ" : row.price + " кредитов"} · {new Date(row.createdAt).toLocaleString("ru-RU")}{row.payment === "REFUNDED" ? " · резерв возвращён" : row.payment === "CHARGED" ? " · оплачен" : " · резерв"}</small>
        {row.note && <p className="radio-dedication">{row.note}</p>}{row.decision && <p>{row.decision}</p>}
        {row.upload && <small>Файл: {row.upload.originalName} · до {new Date(row.upload.expiresAt).toLocaleTimeString("ru-RU")}</small>}
        {preview?.id === row.id && <audio ref={previewRef} controls src={preview.url} preload="metadata" aria-label="Предпрослушивание без эфира" />}
        <div className="radio-actions">
        {row.upload && row.upload.available !== false && new Date(row.upload.expiresAt) > new Date() && <><button type="button" className="action-button secondary" disabled={busy} onClick={() => void action(() => openAudio(row, false))}>Предпрослушать</button><button type="button" className="action-button secondary" disabled={busy} onClick={() => void action(() => openAudio(row, true))}><Download size={14} />Скачать</button></>}
        {mode === "requests" && pending(row) && <button type="button" className="action-button secondary" disabled={busy} onClick={() => void action(() => radioRequest("/requests/" + row.id, { action: "cancel" }, "PATCH"))}>Отменить и вернуть резерв</button>}
        {mode === "studio" && isHost && pending(row) && <>
          {row.status === "WAITING" && <button type="button" className="action-button" disabled={busy} onClick={() => void action(() => radioRequest("/requests/" + row.id, { action: "accept" }, "PATCH"))}>Принять</button>}
          {!row.upload && <label className="radio-attach-track">Прикрепить найденный трек<input className="visually-hidden" type="file" accept="audio/*" disabled={busy} onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ""; if (chosen) void action(async () => { const track = await uploadRadioAudio(chosen); await radioRequest("/requests/" + row.id, { action: "attach", uploadId: track.id }, "PATCH"); }); }} /></label>}
          <button type="button" className="action-button secondary" disabled={busy} onClick={() => { const reason = window.prompt("Причина отклонения (кредиты вернутся)", "Трек недоступен"); if (reason !== null) void action(() => radioRequest("/requests/" + row.id, { action: "reject", reason: reason.slice(0,300) }, "PATCH")); }}>Отклонить</button>
        </>}
        </div>
      </article>)}</div></section>
      {mode === "requests" && <section className="radio-card"><h3>Очередь тусовы</h3><p>Время исполнения зависит от DJ. Посвящения и файлы других пользователей здесь не показываются.</p>{queue.map(row => <p key={row.id}>{row.artist} — {row.title} · {radioLabels[row.status]}</p>)}</section>}
      </>}
    </div>
  </section>;
}


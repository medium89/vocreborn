"use client";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/admin-api";
import { deletePublicMessage } from "@/lib/moderation-api";
type PublicContent = { id: string; authorName: string; body: string; createdAt: string; room: { name: string } };
export function AdminContentPanel() {
  const [query, setQuery] = useState(""), [items, setItems] = useState<PublicContent[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() { setBusy(true); setError(""); try { setItems(await adminRequest<PublicContent[]>("content?q=" + encodeURIComponent(query))); } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка загрузки"); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, []);
  async function remove(id: string) { if (!window.confirm("Удалить публичное сообщение? Действие попадёт в журнал.")) return; setBusy(true); try { await deletePublicMessage(id); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить сообщение"); } finally { setBusy(false); } }
  return <section className="admin-panel"><h3>Публичные сообщения</h3><p>Последние 50 результатов по тексту или имени автора. Личная переписка и приватные комнаты исключены.</p><form onSubmit={event => { event.preventDefault(); void load(); }} className="admin-content-search"><input aria-label="Поиск публичных сообщений" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Текст или имя автора" /><button disabled={busy}>Найти</button></form>{error && <p className="auth-error" role="alert">{error}</p>}<div className="admin-ledger">{items.map(item => <article key={item.id}><strong>{item.authorName} · {item.room.name}</strong><small>{new Date(item.createdAt).toLocaleString("ru-RU")}</small><p>{item.body || "Сообщение с вложением"}</p><button disabled={busy} onClick={() => void remove(item.id)}>Удалить</button></article>)}</div>{!items.length && !busy && <p>Ничего не найдено.</p>}</section>;
}
export function AdminAnnouncementPanel() {
  const [body, setBody] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function send(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); setNotice(""); try { await adminRequest("announcements", { body: body.trim(), requestId: crypto.randomUUID() }, "POST"); setBody(""); setNotice("Объявление отправлено в главную комнату от имени администратора."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отправить объявление"); } finally { setBusy(false); } }
  return <section className="admin-panel"><h3>Объявление в главную комнату</h3><p>Сообщение «Глас админа» сохраняется в истории и приходит всем участникам без обновления страницы.</p>{error && <p role="alert" className="auth-error">{error}</p>}{notice && <p role="status">{notice}</p>}<form onSubmit={send}><label className="admin-operation-reason">Текст объявления<textarea rows={4} maxLength={1000} required value={body} onChange={event => setBody(event.target.value)} /></label><button className="action-button" disabled={busy || !body.trim()}>Опубликовать объявление</button></form></section>;
}

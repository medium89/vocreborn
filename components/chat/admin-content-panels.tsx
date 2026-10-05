"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, Trash2, X } from "lucide-react";
import { adminRequest } from "@/lib/admin-api";
import { deletePublicMessage } from "@/lib/moderation-api";

type PublicContent = { id: string; authorName: string; body: string; createdAt: string; room: { name: string } };

export function AdminContentPanel() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PublicContent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<PublicContent | null>(null);
  const [confirming, setConfirming] = useState<PublicContent | null>(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      setItems(await adminRequest<PublicContent[]>("content?q=" + encodeURIComponent(query)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(item: PublicContent) {
    setBusy(true);
    setError("");
    try {
      await deletePublicMessage(item.id);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setConfirming(null);
      setViewing((current) => current?.id === item.id ? null : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить сообщение");
    } finally {
      setBusy(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return <section className="admin-panel">
    <h3>Публичные сообщения</h3>
    <form onSubmit={submitSearch} className="admin-content-search">
      <input aria-label="Поиск публичных сообщений" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Текст или имя автора" />
      <button disabled={busy}>Найти</button>
    </form>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="admin-ledger">
      {items.map((item) => <article key={item.id}>
        <div>
          <strong>{item.authorName} · {item.room.name}</strong>
          <small>{new Date(item.createdAt).toLocaleString("ru-RU")}</small>
        </div>
        <span className="admin-record-actions">
          <button type="button" title="Просмотреть" aria-label={"Просмотреть сообщение от " + item.authorName} disabled={busy} onClick={() => setViewing(item)}><Eye size={16} /></button>
          <button type="button" title="Удалить" aria-label={"Удалить сообщение от " + item.authorName} disabled={busy} onClick={() => setConfirming(item)}><Trash2 size={16} /></button>
        </span>
      </article>)}
    </div>
    {!items.length && !busy && <p>Ничего не найдено.</p>}
    {viewing && <div className="modal-backdrop" onMouseDown={() => setViewing(null)}>
      <section className="modal admin-record-dialog" role="dialog" aria-modal="true" aria-label="Публичное сообщение" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setViewing(null)}><X size={18} /></button>
        <h3>{viewing.authorName} · {viewing.room.name}</h3>
        <p className="admin-record-meta">{new Date(viewing.createdAt).toLocaleString("ru-RU")}</p>
        <p className="admin-record-body">{viewing.body || "Сообщение с вложением"}</p>
        <footer>
          <button type="button" className="action-button secondary" onClick={() => setViewing(null)}>Закрыть</button>
          <button type="button" className="action-button" disabled={busy} onClick={() => setConfirming(viewing)}><Trash2 size={15} />Удалить</button>
        </footer>
      </section>
    </div>}
    {confirming && <div className="modal-backdrop" onMouseDown={() => setConfirming(null)}>
      <section className="modal admin-record-dialog admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Подтверждение удаления сообщения" onMouseDown={(event) => event.stopPropagation()}>
        <h3>Удалить сообщение?</h3>
        <p>Сообщение от «{confirming.authorName}» будет удалено, а действие попадёт в журнал.</p>
        <footer>
          <button type="button" className="action-button secondary" disabled={busy} onClick={() => setConfirming(null)}>Отмена</button>
          <button type="button" className="action-button" disabled={busy} onClick={() => void remove(confirming)}><Trash2 size={15} />Удалить</button>
        </footer>
      </section>
    </div>}
  </section>;
}

export function AdminAnnouncementPanel() {
  const [body, setBody] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function send(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); setNotice(""); try { await adminRequest("announcements", { body: body.trim(), requestId: crypto.randomUUID() }, "POST"); setBody(""); setNotice("Объявление отправлено в главную комнату от имени «Администрация»."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отправить объявление"); } finally { setBusy(false); } }
  return <section className="admin-panel"><h3>Объявление в главную комнату</h3><p>Сообщение придёт всем участникам без обновления страницы от обезличенного пользователя «Администрация» и сохранится в истории.</p>{error && <p role="alert" className="auth-error">{error}</p>}{notice && <p role="status">{notice}</p>}<form onSubmit={send}><label className="admin-operation-reason">Текст объявления<textarea rows={4} maxLength={1000} required value={body} onChange={event => setBody(event.target.value)} /></label><button className="action-button" disabled={busy || !body.trim()}>Опубликовать объявление</button></form></section>;
}

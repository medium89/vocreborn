"use client";
import { FormEvent, useState } from "react";
import { ArrowRight, Headset, X } from "lucide-react";
import { createSupportTicket } from "@/lib/support-api";
export function SupportModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const ticket = await createSupportTicket(subject.trim(), message.trim());
      setTicketId(ticket.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить обращение");
    } finally { setBusy(false); }
  }
  return <div className="support-backdrop" onMouseDown={onClose} role="presentation">
    <section className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-title" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="support-close" aria-label="Закрыть" onClick={onClose}><X size={20} /></button>
      <span className="support-kicker"><Headset size={20} /> СВЯЗЬ С КОМАНДОЙ</span>
      <h2 id="support-title">Написать в поддержку</h2>
      {ticketId ? <div className="support-success" role="status">
        <strong>Обращение отправлено</strong>
        <p>Мы получили твоё сообщение. Номер обращения: <code>{ticketId.slice(0, 8)}</code>.</p>
        <button type="button" onClick={onClose}>Вернуться в чат</button>
      </div> : <form onSubmit={(event) => void submit(event)}>
        <p>Расскажи, что случилось. Заявка попадёт администраторам, которые смогут связаться с тобой в чате.</p>
        <label>Тема<input required minLength={3} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Например, не открывается комната" /></label>
        <label>Сообщение<textarea required minLength={10} maxLength={4000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Опиши проблему и шаги, после которых она возникает" /></label>
        {error && <p className="support-error" role="alert">{error}</p>}
        <button className="support-submit" type="submit" disabled={busy}>{busy ? "Отправляем…" : <>Отправить обращение <ArrowRight size={18} /></>}</button>
      </form>}
    </section>
  </div>;
}

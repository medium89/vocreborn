"use client";
import { useEffect, useState } from "react";
import { Check, Headset, RefreshCw } from "lucide-react";
import { fetchSupportTickets, reviewSupportTicket, type SupportTicket } from "@/lib/support-api";
export function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setError(""); setLoading(true);
    try { setTickets(await fetchSupportTickets()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить обращения"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function resolve(id: string) {
    try {
      await reviewSupportTicket(id, "RESOLVED");
      setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, status: "RESOLVED" } : ticket));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось закрыть обращение"); }
  }
  const open = tickets.filter((ticket) => ticket.status === "OPEN");
  return <section className="support-tickets-panel">
    <div className="support-tickets-heading"><h3><Headset size={18} /> Обращения в поддержку <b>{open.length}</b></h3><button type="button" onClick={() => void load()} aria-label="Обновить обращения"><RefreshCw size={16} /></button></div>
    {error && <p className="support-error" role="alert">{error}</p>}
    {loading ? <p>Загрузка обращений…</p> : open.length === 0 ? <p>Новых обращений нет.</p> : <div className="support-tickets-list">{open.map((ticket) => <article key={ticket.id}>
      <div><strong>{ticket.subject}</strong><small>{ticket.user.displayName} (@{ticket.user.username}) · {new Date(ticket.createdAt).toLocaleString("ru-RU")}</small></div>
      <p>{ticket.message}</p>
      <button type="button" onClick={() => void resolve(ticket.id)}><Check size={15} /> Отметить решённым</button>
    </article>)}</div>}
  </section>;
}

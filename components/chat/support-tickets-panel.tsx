"use client";
import { useEffect, useState } from "react";
import { Check, Eye, Headset, RefreshCw, X } from "lucide-react";
import { fetchSupportTickets, reviewSupportTicket, type SupportTicket } from "@/lib/support-api";
export function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<SupportTicket | null>(null);
  const [confirming, setConfirming] = useState<SupportTicket | null>(null);
  async function load() { setError(""); setLoading(true); try { setTickets(await fetchSupportTickets()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить обращения"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function resolve(ticket: SupportTicket) { try { await reviewSupportTicket(ticket.id, "RESOLVED"); setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, status: "RESOLVED" } : item)); setConfirming(null); setViewing(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось закрыть обращение"); } }
  const open = tickets.filter((ticket) => ticket.status === "OPEN");
  return <section className="support-tickets-panel">
    <div className="support-tickets-heading"><h3><Headset size={18} /> Обращения в поддержку <b>{open.length}</b></h3><button type="button" onClick={() => void load()} aria-label="Обновить обращения"><RefreshCw size={16} /></button></div>
    {error && <p className="support-error" role="alert">{error}</p>}
    {loading ? <p>Загрузка обращений…</p> : open.length === 0 ? <p>Новых обращений нет.</p> : <div className="support-tickets-list">{open.map((ticket) => <article key={ticket.id}><div><strong>{ticket.subject}</strong><small>{ticket.user.displayName} (@{ticket.user.username}) · {new Date(ticket.createdAt).toLocaleString("ru-RU")}</small></div><span className="admin-record-actions"><button type="button" title="Просмотреть" aria-label={"Просмотреть обращение " + ticket.subject} onClick={() => setViewing(ticket)}><Eye size={16} /></button><button type="button" title="Закрыть" onClick={() => setConfirming(ticket)}><Check size={16} /></button></span></article>)}</div>}
    {viewing && <div className="modal-backdrop" onMouseDown={() => setViewing(null)}><section className="modal admin-record-dialog" role="dialog" aria-modal="true" aria-label="Обращение в поддержку" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Закрыть" onClick={() => setViewing(null)}><X size={18} /></button><h3>{viewing.subject}</h3><p className="admin-record-meta">{viewing.user.displayName} (@{viewing.user.username}) · {new Date(viewing.createdAt).toLocaleString("ru-RU")}</p><p className="admin-record-body">{viewing.message}</p><footer><button className="action-button" onClick={() => setConfirming(viewing)}><Check size={15} />Закрыть обращение</button></footer></section></div>}
    {confirming && <div className="modal-backdrop" onMouseDown={() => setConfirming(null)}><section className="modal admin-record-dialog admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Подтверждение закрытия" onMouseDown={(event) => event.stopPropagation()}><h3>Закрыть обращение?</h3><p>Обращение «{confirming.subject}» будет отмечено как решённое.</p><footer><button type="button" className="action-button secondary" onClick={() => setConfirming(null)}>Отмена</button><button type="button" className="action-button" onClick={() => void resolve(confirming)}><Check size={15} />Подтвердить</button></footer></section></div>}
  </section>;
}

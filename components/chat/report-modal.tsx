"use client";

import { useState } from "react";
import { Check, ChevronDown, Flag, X } from "lucide-react";
import type { ReportReason } from "@/lib/chat-contract";

const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: "SPAM", label: "Спам" },
  { value: "HARASSMENT", label: "Оскорбления" },
  { value: "IMPERSONATION", label: "Выдаёт себя за другого" },
  { value: "ILLEGAL", label: "Запрещённый материал" },
  { value: "OTHER", label: "Другое" },
];

type Props = {
  target: { label: string; userId?: string; messageId?: string };
  onSubmit: (input: { userId?: string; messageId?: string; reason: ReportReason; details?: string }) => Promise<void>;
  onClose: () => void;
};

export function ReportModal({ target, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason>("SPAM");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await onSubmit({ userId: target.userId, messageId: target.messageId, reason, details: details.trim() || undefined });
      onClose();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "Не удалось отправить жалобу");
    } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal report-modal" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button><h2>Пожаловаться</h2><p>{target.label}</p>
    <form className="report-form" onSubmit={submit}>
      <div className="report-reason-field"><span id="report-reason-label">Причина</span><div className="report-reason-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setReasonOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setReasonOpen(false); }}><button type="button" className="report-reason-trigger" aria-labelledby="report-reason-label" aria-haspopup="listbox" aria-expanded={reasonOpen} onClick={() => setReasonOpen((open) => !open)}>{reasons.find((item) => item.value === reason)?.label}<ChevronDown size={16} /></button>{reasonOpen && <div className="report-reason-options" role="listbox" aria-labelledby="report-reason-label">{reasons.map((item) => <button type="button" key={item.value} role="option" aria-selected={item.value === reason} onClick={() => { setReason(item.value); setReasonOpen(false); }}>{item.label}{item.value === reason && <Check size={14} />}</button>)}</div>}</div></div>
      <label>Комментарий<textarea rows={4} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Необязательно" /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="action-button" disabled={busy}>{busy ? <span>Отправка…</span> : <><Flag size={15} /><span>Отправить жалобу</span></>}</button>
    </form>
  </div></div>;
}

"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";
import type { ReportReason } from "@/lib/chat-contract";

type Props = {
  target: { label: string; userId?: string; messageId?: string };
  onSubmit: (input: { userId?: string; messageId?: string; reason: ReportReason; details?: string }) => Promise<void>;
  onClose: () => void;
};

export function ReportModal({ target, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason>("SPAM");
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
      <label>Причина<select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}><option value="SPAM">Спам</option><option value="HARASSMENT">Оскорбления</option><option value="IMPERSONATION">Выдаёт себя за другого</option><option value="ILLEGAL">Запрещённый материал</option><option value="OTHER">Другое</option></select></label>
      <label>Комментарий<textarea rows={4} maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Необязательно" /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="action-button" disabled={busy}>{busy ? <span>Отправка…</span> : <><Flag size={15} /><span>Отправить жалобу</span></>}</button>
    </form>
  </div></div>;
}

"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Flag, ScrollText, ShieldCheck, X, XCircle } from "lucide-react";
import type { AuditEntry, Report, ReportStatus } from "@/lib/chat-contract";
import { fetchAudit, fetchReports, reviewReport } from "@/lib/reports-api";

const statusLabels: Record<ReportStatus, string> = { OPEN: "Открыта", REVIEWED: "Проверяется", DISMISSED: "Отклонена", ACTIONED: "Приняты меры" };
const reasonLabels = { SPAM: "Спам", HARASSMENT: "Оскорбления", IMPERSONATION: "Выдача себя за другого", ILLEGAL: "Запрещённый материал", OTHER: "Другое" } as const;
const actionLabels: Record<string, string> = { REPORT_REVIEWED: "Жалоба взята в работу", REPORT_DISMISSED: "Жалоба отклонена", REPORT_ACTIONED: "По жалобе приняты меры", MUTE: "Запрещена отправка сообщений", UNMUTE: "Ограничение снято", BAN: "Аккаунт заблокирован", UNBAN: "Блокировка снята", MESSAGE_DELETE: "Сообщение удалено", ATTACHMENT_APPROVE: "Вложение разрешено", ATTACHMENT_REJECT: "Вложение отклонено", ROLE_CHANGE: "Роль изменена", USER_DEACTIVATE: "Аккаунт отключён", PROFILE_POST_DELETE: "Сообщение профиля удалено" };

export function ReportsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"reports" | "audit">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [nextReports, nextAudit] = await Promise.all([fetchReports(), fetchAudit()]);
      setReports(nextReports); setAudit(nextAudit);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить очередь");
    }
  }

  useEffect(() => { void load(); }, []);

  async function review(id: string, status: "REVIEWED" | "DISMISSED" | "ACTIONED") {
    try {
      await reviewReport(id, status, resolution[id]);
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Не удалось обновить жалобу");
    }
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal reports-modal" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button><h2>Центр модерации</h2>
    <div className="auth-tabs"><button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><Flag size={14} /><span>Жалобы</span></button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ScrollText size={14} /><span>Журнал</span></button></div>
    {error && <div className="auth-error">{error}</div>}
    {tab === "reports" ? <div className="report-list">{reports.length === 0 ? <p>Жалоб пока нет.</p> : reports.map((report) => <article className="report-card" key={report.id}>
      <div><b>{statusLabels[report.status]}</b><time>{new Date(report.createdAt).toLocaleString("ru-RU")}</time></div>
      <strong>{report.message ? "Сообщение " + report.message.authorName : "Пользователь " + (report.targetUser?.displayName ?? "удалён")}</strong>
      {report.message && <blockquote>{report.message.body}</blockquote>}
      <small>От: {report.reporter.displayName} · {reasonLabels[report.reason]}</small>
      {report.details && <p>{report.details}</p>}
      <input maxLength={1000} value={resolution[report.id] ?? report.resolution ?? ""} onChange={(event) => setResolution((old) => ({ ...old, [report.id]: event.target.value }))} placeholder="Решение модератора" />
      <div className="report-actions"><button onClick={() => void review(report.id, "REVIEWED")}><ClipboardList size={13} /><span>В работу</span></button><button onClick={() => void review(report.id, "DISMISSED")}><XCircle size={13} /><span>Отклонить</span></button><button onClick={() => void review(report.id, "ACTIONED")}><ShieldCheck size={13} /><span>Меры приняты</span></button></div>
    </article>)}</div> : <div className="audit-list">{audit.length === 0 ? <p>Журнал пуст.</p> : audit.map((entry) => <article key={entry.id}><div><b>{actionLabels[entry.action] ?? "Действие модератора"}</b><time>{new Date(entry.createdAt).toLocaleString("ru-RU")}</time></div><small>{entry.actor.displayName}{entry.targetUser ? " → " + entry.targetUser.displayName : ""}</small></article>)}</div>}
  </div></div>;
}

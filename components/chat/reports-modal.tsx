"use client";

import { useEffect, useState } from "react";
import { Ban, ClipboardList, Flag, ScrollText, ShieldCheck, Trash2, UserRoundX, XCircle } from "lucide-react";
import type { AuditEntry, Report, ReportStatus } from "@/lib/chat-contract";
import { actOnReport, fetchAudit, fetchReports, reviewReport, type ReportAction } from "@/lib/reports-api";
import { BackToChatButton } from "./back-to-chat-button";

const statusLabels: Record<ReportStatus, string> = { OPEN: "Открыта", REVIEWED: "Проверяется", DISMISSED: "Отклонена", ACTIONED: "Приняты меры" };
const reasonLabels = { SPAM: "Спам", HARASSMENT: "Оскорбления", IMPERSONATION: "Выдача себя за другого", ILLEGAL: "Запрещённый материал", OTHER: "Другое" } as const;
const actionLabels: Record<string, string> = { REPORT_REVIEWED: "Жалоба взята в работу", REPORT_DISMISSED: "Жалоба отклонена", REPORT_ACTIONED: "По жалобе приняты меры", MUTE: "Запрещена отправка сообщений", CHAOS: "Назначен Хаос", UNCHAOS: "Хаос снят", UNMUTE: "Ограничение снято", BAN: "Аккаунт заблокирован", UNBAN: "Блокировка снята", MESSAGE_DELETE: "Сообщение удалено", ATTACHMENT_APPROVE: "Вложение разрешено", ATTACHMENT_REJECT: "Вложение отклонено", ROLE_CHANGE: "Роль изменена", USER_DEACTIVATE: "Аккаунт отключён", PROFILE_POST_DELETE: "Сообщение профиля удалено" };
const measureLabels: Record<ReportAction, string> = {
  DELETE_MESSAGE: "Удалить сообщение",
  MUTE_HOUR: "Запретить писать на час",
  MUTE_DAY: "Запретить писать на сутки",
  CHAOS_DAY: "Назначить Хаос на сутки",
  BAN_DAY: "Заблокировать на сутки",
};

export function ReportsModal({ onBackToChat, canBan }: { onBackToChat: () => void; canBan: boolean }) {
  const [tab, setTab] = useState<"reports" | "audit">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [nextReports, nextAudit] = await Promise.all([fetchReports(), fetchAudit()]);
      setReports(nextReports);
      setAudit(nextAudit);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить очередь");
    }
  }

  useEffect(() => { void load(); }, []);

  async function review(report: Report, status: "REVIEWED" | "DISMISSED") {
    if (status === "DISMISSED" && !window.confirm("Отклонить жалобу без применения мер?")) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await reviewReport(report.id, status, resolution[report.id]);
      await load();
      setNotice(status === "DISMISSED" ? "Жалоба отклонена." : "Жалоба взята в работу.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Не удалось обновить жалобу");
    } finally {
      setBusyId(null);
    }
  }

  async function applyMeasure(report: Report, action: ReportAction) {
    const target = report.message?.authorName ?? report.targetUser?.displayName ?? "пользователя";
    if (!window.confirm(measureLabels[action] + " — " + target + "? Это действие будет записано в журнале модерации.")) return;
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await actOnReport(report.id, action, resolution[report.id]);
      await load();
      setNotice("Мера применена, жалоба закрыта. Подробности — во вкладке «Журнал».");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось применить меру");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="management-module reports-module">
    <header className="management-module-head"><div className="page-heading"><span className="page-heading-icon"><ShieldCheck size={19} /></span><div className="page-heading-copy"><span className="eyebrow">ЖАЛОБЫ И ЖУРНАЛ</span><h2>Модерация</h2></div></div><BackToChatButton onClick={onBackToChat} /></header>
    <div className="management-module-body">
      <div className="auth-tabs"><button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><Flag size={14} /><span>Жалобы</span></button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}><ScrollText size={14} /><span>Журнал</span></button></div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="security-message" role="status">{notice}</div>}
      {tab === "reports" ? <div className="report-list">{reports.length === 0 ? <p>Жалоб пока нет.</p> : reports.slice().sort((a, b) => Number(b.status === "OPEN" || b.status === "REVIEWED") - Number(a.status === "OPEN" || a.status === "REVIEWED")).map((report) => {
        const active = report.status === "OPEN" || report.status === "REVIEWED";
        const canTargetUser = report.canRestrictTarget === true;
        return <article className="report-card" key={report.id}>
          <div><b>{statusLabels[report.status]}</b><time>{new Date(report.createdAt).toLocaleString("ru-RU")}</time></div>
          <strong>{report.message ? "Сообщение: " + report.message.authorName : "Пользователь: " + (report.targetUser?.displayName ?? "удалён")}</strong>
          {report.message && <blockquote>{report.message.body}</blockquote>}
          <small>Жалоба от {report.reporter.displayName} · {reasonLabels[report.reason]}</small>
          {report.details && <p>{report.details}</p>}
          {active ? <>
            <label className="report-resolution-label" htmlFor={"report-resolution-" + report.id}>Комментарий к решению (необязательно)</label>
            <input id={"report-resolution-" + report.id} maxLength={500} value={resolution[report.id] ?? ""} onChange={(event) => setResolution((old) => ({ ...old, [report.id]: event.target.value }))} placeholder="Например: спам в общем чате" disabled={busyId === report.id} />
            <div className="report-actions">
              {report.status === "OPEN" && <button disabled={busyId === report.id} onClick={() => void review(report, "REVIEWED")}><ClipboardList size={15} /><span>В работу</span></button>}
              {report.message?.roomId && <button disabled={busyId === report.id} onClick={() => void applyMeasure(report, "DELETE_MESSAGE")}><Trash2 size={15} /><span>Удалить сообщение</span></button>}
              {canTargetUser && <button disabled={busyId === report.id} onClick={() => void applyMeasure(report, "MUTE_HOUR")}><UserRoundX size={15} /><span>Мут на час</span></button>}
              {canTargetUser && <button disabled={busyId === report.id} onClick={() => void applyMeasure(report, "MUTE_DAY")}><UserRoundX size={15} /><span>Мут на сутки</span></button>}
              {canTargetUser && <button disabled={busyId === report.id} onClick={() => void applyMeasure(report, "CHAOS_DAY")}><Ban size={15} /><span>Хаос на сутки</span></button>}
              {canBan && canTargetUser && <button disabled={busyId === report.id} onClick={() => void applyMeasure(report, "BAN_DAY")}><Ban size={15} /><span>Бан на сутки</span></button>}
              <button disabled={busyId === report.id} onClick={() => void review(report, "DISMISSED")}><XCircle size={15} /><span>Отклонить</span></button>
            </div>
          </> : <p className="report-outcome">{report.resolution || "Решение не указано"}{report.handledBy ? " · " + report.handledBy.displayName : ""}</p>}
        </article>;
      })}</div> : <div className="audit-list">{audit.length === 0 ? <p>Журнал пуст.</p> : audit.map((entry) => <article key={entry.id}><div><b>{actionLabels[entry.action] ?? "Действие модератора"}</b><time>{new Date(entry.createdAt).toLocaleString("ru-RU")}</time></div><small>{entry.actor.displayName}{entry.targetUser ? " → " + entry.targetUser.displayName : ""}</small></article>)}</div>}
    </div>
  </section>;
}

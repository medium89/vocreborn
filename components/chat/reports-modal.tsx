"use client";

import { useEffect, useState } from "react";
import { Ban, ClipboardList, Eye, Flag, Pencil, ScrollText, ShieldCheck, Trash2, UserRoundX, X, XCircle } from "lucide-react";
import type { AuditEntry, Report, ReportStatus } from "@/lib/chat-contract";
import { actOnReport, fetchAudit, fetchReports, reviewReport, type ReportAction } from "@/lib/reports-api";
import { BackToChatButton } from "./back-to-chat-button";

const statusLabels: Record<ReportStatus, string> = { OPEN: "Открыта", REVIEWED: "Проверяется", DISMISSED: "Отклонена", ACTIONED: "Приняты меры" };
const reasonLabels = { SPAM: "Спам", HARASSMENT: "Оскорбления", IMPERSONATION: "Выдача себя за другого", ILLEGAL: "Запрещённый материал", OTHER: "Другое" } as const;
const actionLabels: Record<string, string> = { REPORT_REVIEWED: "Жалоба взята в работу", REPORT_DISMISSED: "Жалоба отклонена", REPORT_ACTIONED: "По жалобе приняты меры", MUTE: "Запрещена отправка сообщений", CHAOS: "Назначен Хаос", UNCHAOS: "Хаос снят", UNMUTE: "Ограничение снято", BAN: "Аккаунт заблокирован", UNBAN: "Блокировка снята", MESSAGE_DELETE: "Сообщение удалено", ATTACHMENT_APPROVE: "Вложение разрешено", ATTACHMENT_REJECT: "Вложение отклонено", ROLE_CHANGE: "Роль изменена", USER_DEACTIVATE: "Аккаунт отключён", USER_EDIT: "Профиль изменён", CREDITS_ADJUST: "Изменены кредиты", CHAT_SETTINGS: "Настройки чата изменены", SESSIONS_REVOKE: "Сеансы завершены", COSMETIC_ADMIN: "Изменено оформление", PROFILE_POST_DELETE: "Сообщение профиля удалено" };
const measureLabels: Record<ReportAction, string> = {
  DELETE_MESSAGE: "Удалить сообщение",
  MUTE_HOUR: "Запретить писать на час",
  MUTE_DAY: "Запретить писать на сутки",
  CHAOS_DAY: "Назначить Хаос на сутки",
  BAN_DAY: "Заблокировать на сутки",
};

type PendingAction = { type: "dismiss"; report: Report } | { type: "measure"; report: Report; action: ReportAction };

function isActiveReport(report: Report) {
  return report.status === "OPEN" || report.status === "REVIEWED";
}

function reportSubject(report: Report) {
  return report.message ? "Сообщение: " + report.message.authorName : "Пользователь: " + (report.targetUser?.displayName ?? "удалён");
}

function reportTarget(report: Report) {
  return report.message?.authorName ?? report.targetUser?.displayName ?? "пользователя";
}

function formatAuditDetails(details: unknown) {
  try {
    return JSON.stringify(details, null, 2) ?? String(details);
  } catch {
    return String(details);
  }
}

export function ReportsModal({ onBackToChat, canBan, initialTab = "reports" }: { onBackToChat: () => void; canBan: boolean; initialTab?: "reports" | "audit" }) {
  const [tab, setTab] = useState<"reports" | "audit">(initialTab);
  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<Report | null>(null);
  const [editing, setEditing] = useState<Report | null>(null);
  const [viewingAudit, setViewingAudit] = useState<AuditEntry | null>(null);
  const [confirming, setConfirming] = useState<PendingAction | null>(null);

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

  function closeReportDialogs() {
    setViewing(null);
    setEditing(null);
    setConfirming(null);
  }

  async function review(report: Report, status: "REVIEWED" | "DISMISSED") {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await reviewReport(report.id, status, resolution[report.id]);
      await load();
      setNotice(status === "DISMISSED" ? "Жалоба отклонена." : "Жалоба взята в работу.");
      closeReportDialogs();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Не удалось обновить жалобу");
    } finally {
      setBusyId(null);
    }
  }

  async function applyMeasure(report: Report, action: ReportAction) {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      await actOnReport(report.id, action, resolution[report.id]);
      await load();
      setNotice("Мера применена, жалоба закрыта. Подробности — во вкладке «Журнал».");
      closeReportDialogs();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось применить меру");
    } finally {
      setBusyId(null);
    }
  }

  const sortedReports = reports.slice().sort((a, b) => Number(isActiveReport(b)) - Number(isActiveReport(a)));

  return <section className="management-module reports-module">
    <header className="management-module-head">
      <div className="page-heading">
        <span className="page-heading-icon"><ShieldCheck size={19} /></span>
        <div className="page-heading-copy"><span className="eyebrow">ЖАЛОБЫ И ЖУРНАЛ</span><h2>Модерация</h2></div>
      </div>
      <BackToChatButton onClick={onBackToChat} />
    </header>
    <div className="management-module-body">
      <div className="admin-shortcuts report-subtabs" aria-label="Разделы модерации">
        <button type="button" aria-pressed={tab === "reports"} onClick={() => setTab("reports")}><Flag size={14} /><span>Жалобы</span></button>
        <button type="button" aria-pressed={tab === "audit"} onClick={() => setTab("audit")}><ScrollText size={14} /><span>Журнал</span></button>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="security-message" role="status">{notice}</div>}
      {tab === "reports" ? <div className="report-list">
        {sortedReports.length === 0 ? <p>Жалоб пока нет.</p> : sortedReports.map((report) => {
          const active = isActiveReport(report);
          return <article className="report-card" key={report.id}>
            <div className="report-card-summary">
              <strong>{reportSubject(report)}</strong>
              <small>{statusLabels[report.status]} · {new Date(report.createdAt).toLocaleString("ru-RU")}</small>
              <small>Жалоба от {report.reporter.displayName} · {reasonLabels[report.reason]}</small>
            </div>
            <span className="admin-record-actions">
              <button type="button" title="Просмотреть" aria-label={"Просмотреть жалобу: " + reportSubject(report)} onClick={() => setViewing(report)}><Eye size={16} /></button>
              {active && <button type="button" title="Рассмотреть" aria-label={"Рассмотреть жалобу: " + reportSubject(report)} onClick={() => setEditing(report)}><Pencil size={16} /></button>}
            </span>
          </article>;
        })}
      </div> : <div className="audit-list">
        {audit.length === 0 ? <p>Журнал пуст.</p> : audit.map((entry) => <article key={entry.id}>
          <div className="audit-card-summary">
            <strong>{actionLabels[entry.action] ?? "Действие модератора"}</strong>
            <small>{entry.actor.displayName}{entry.targetUser ? " → " + entry.targetUser.displayName : ""} · {new Date(entry.createdAt).toLocaleString("ru-RU")}</small>
          </div>
          <span className="admin-record-actions">
            <button type="button" title="Просмотреть" aria-label={"Просмотреть запись журнала: " + (actionLabels[entry.action] ?? "действие модератора")} onClick={() => setViewingAudit(entry)}><Eye size={16} /></button>
          </span>
        </article>)}
      </div>}
    </div>

    {viewing && <div className="modal-backdrop" onMouseDown={() => setViewing(null)}>
      <section className="modal admin-record-dialog report-view-dialog" role="dialog" aria-modal="true" aria-label="Просмотр жалобы" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setViewing(null)}><X size={18} /></button>
        <h3>{reportSubject(viewing)}</h3>
        <p className="admin-record-meta">{statusLabels[viewing.status]} · {new Date(viewing.createdAt).toLocaleString("ru-RU")} · жалоба от {viewing.reporter.displayName}</p>
        <p className="admin-record-meta">Причина: {reasonLabels[viewing.reason]}</p>
        {viewing.message && <blockquote className="report-dialog-message">{viewing.message.body}</blockquote>}
        {viewing.details && <p className="admin-record-body">{viewing.details}</p>}
        {!isActiveReport(viewing) && <p className="report-outcome">{viewing.resolution || "Решение не указано"}{viewing.handledBy ? " · " + viewing.handledBy.displayName : ""}</p>}
        <footer>
          {isActiveReport(viewing) && <button type="button" className="action-button" onClick={() => { setViewing(null); setEditing(viewing); }}><Pencil size={15} />Рассмотреть</button>}
          <button type="button" className="action-button secondary" onClick={() => setViewing(null)}>Закрыть</button>
        </footer>
      </section>
    </div>}

    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
      <section className="modal admin-record-dialog report-editor-dialog" role="dialog" aria-modal="true" aria-label="Рассмотрение жалобы" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setEditing(null)}><X size={18} /></button>
        <h3>{reportSubject(editing)}</h3>
        <p className="admin-record-meta">Причина: {reasonLabels[editing.reason]} · жалоба от {editing.reporter.displayName}</p>
        {editing.message && <blockquote className="report-dialog-message">{editing.message.body}</blockquote>}
        {editing.details && <p className="admin-record-body">{editing.details}</p>}
        <label className="report-resolution-label" htmlFor={"report-resolution-" + editing.id}>Комментарий к решению (необязательно)</label>
        <input id={"report-resolution-" + editing.id} maxLength={500} value={resolution[editing.id] ?? ""} onChange={(event) => setResolution((old) => ({ ...old, [editing.id]: event.target.value }))} placeholder="Например: спам в общем чате" disabled={busyId === editing.id} />
        <div className="report-actions">
          {editing.status === "OPEN" && <button type="button" disabled={busyId === editing.id} onClick={() => void review(editing, "REVIEWED")}><ClipboardList size={15} /><span>В работу</span></button>}
          {editing.message?.roomId && <button type="button" disabled={busyId === editing.id} onClick={() => setConfirming({ type: "measure", report: editing, action: "DELETE_MESSAGE" })}><Trash2 size={15} /><span>Удалить сообщение</span></button>}
          {editing.canRestrictTarget === true && <button type="button" disabled={busyId === editing.id} onClick={() => setConfirming({ type: "measure", report: editing, action: "MUTE_HOUR" })}><UserRoundX size={15} /><span>Мут на час</span></button>}
          {editing.canRestrictTarget === true && <button type="button" disabled={busyId === editing.id} onClick={() => setConfirming({ type: "measure", report: editing, action: "MUTE_DAY" })}><UserRoundX size={15} /><span>Мут на сутки</span></button>}
          {editing.canRestrictTarget === true && <button type="button" disabled={busyId === editing.id} onClick={() => setConfirming({ type: "measure", report: editing, action: "CHAOS_DAY" })}><Ban size={15} /><span>Хаос на сутки</span></button>}
          {canBan && editing.canRestrictTarget === true && <button type="button" disabled={busyId === editing.id} onClick={() => setConfirming({ type: "measure", report: editing, action: "BAN_DAY" })}><Ban size={15} /><span>Бан на сутки</span></button>}
          <button type="button" disabled={busyId === editing.id} onClick={() => setConfirming({ type: "dismiss", report: editing })}><XCircle size={15} /><span>Отклонить</span></button>
        </div>
        <footer><button type="button" className="action-button secondary" disabled={busyId === editing.id} onClick={() => setEditing(null)}>Закрыть</button></footer>
      </section>
    </div>}

    {viewingAudit && <div className="modal-backdrop" onMouseDown={() => setViewingAudit(null)}>
      <section className="modal admin-record-dialog report-view-dialog" role="dialog" aria-modal="true" aria-label="Просмотр записи журнала" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setViewingAudit(null)}><X size={18} /></button>
        <h3>{actionLabels[viewingAudit.action] ?? "Действие модератора"}</h3>
        <p className="admin-record-meta">{new Date(viewingAudit.createdAt).toLocaleString("ru-RU")} · {viewingAudit.actor.displayName}{viewingAudit.targetUser ? " → " + viewingAudit.targetUser.displayName : ""}</p>
        {viewingAudit.details != null && <pre className="audit-dialog-details">{formatAuditDetails(viewingAudit.details)}</pre>}
        <footer><button type="button" className="action-button secondary" onClick={() => setViewingAudit(null)}>Закрыть</button></footer>
      </section>
    </div>}

    {confirming && <div className="modal-backdrop" onMouseDown={() => busyId !== confirming.report.id && setConfirming(null)}>
      <section className="modal admin-record-dialog admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Подтверждение действия модератора" onMouseDown={(event) => event.stopPropagation()}>
        <h3>{confirming.type === "dismiss" ? "Отклонить жалобу?" : measureLabels[confirming.action] + "?"}</h3>
        <p>{confirming.type === "dismiss" ? "Жалоба будет закрыта без применения мер." : measureLabels[confirming.action] + " — " + reportTarget(confirming.report) + ". Действие будет записано в журнале модерации."}</p>
        <footer>
          <button type="button" className="action-button secondary" disabled={busyId === confirming.report.id} onClick={() => setConfirming(null)}>Отмена</button>
          <button type="button" className="action-button" disabled={busyId === confirming.report.id} onClick={() => {
            if (confirming.type === "dismiss") void review(confirming.report, "DISMISSED");
            else void applyMeasure(confirming.report, confirming.action);
          }}>Подтвердить</button>
        </footer>
      </section>
    </div>}
  </section>;
}

import { ArrowLeft, AtSign, Bell, ChevronLeft, ChevronRight, CornerUpLeft, Eye, Gift, Image, MessageCircle, ShieldAlert, SmilePlus, Trash2 } from "lucide-react";
import { StyledSelect } from "./styled-select";
import { useEffect, useRef, useState } from "react";
import type { NotificationItem, ReactionType } from "@/lib/chat-contract";
import { Avatar } from "./avatar";
import { fetchNotificationHistory, type NotificationHistory } from "@/lib/notifications-api";
import { notificationTypeOptions } from "@/lib/tab-alerts";

const labels: Record<NotificationItem["type"], string> = { reply: "ответил(а) на ваше сообщение", mention: "упомянул(а) вас в сообщении", reaction: "оценил(а) ваше сообщение", gift: "отправил(а) вам подарок", profile_post: "оставил(а) запись на вашей стене", profile_post_reply: "ответил(а) на запись на стене", mute: "ограничил(а) вам отправку сообщений", unmute: "снял(а) ограничение на отправку", ban: "заблокировал(а) ваш аккаунт", unban: "разблокировал(а) ваш аккаунт", photo_like: "оценил(а) вашу фотографию", photo_comment: "прокомментировал(а) вашу фотографию" };

const reactions: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: "👍", label: "нравится" },
  dislike: { emoji: "👎", label: "не нравится" },
  laugh: { emoji: "😂", label: "смешно" },
  disgust: { emoji: "🤢", label: "отвратительно" },
  love: { emoji: "❤️", label: "любовь" },
  surprise: { emoji: "😮", label: "удивление" },
  sad: { emoji: "😢", label: "грусть" },
};

type NotificationsPageProps = {
  enabledTypes: NotificationItem["type"][];
  allNotificationsCount: number;
  onClearAll: () => Promise<void>;
  onOpen: (notification: NotificationItem) => void;
  onClose: () => void;
  onDelete: (notificationId: string) => Promise<void>;
};

export function NotificationsPage({ enabledTypes, allNotificationsCount, onClearAll, onOpen, onClose, onDelete }: NotificationsPageProps) {
  const [deleteHoldingId, setDeleteHoldingId] = useState<string | null>(null);
  const deleteHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clearHolding, setClearHolding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filter, setFilter] = useState<NotificationItem["type"] | "all">("all");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<NotificationHistory>({ items: [], total: 0, page: 1, pages: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const enabledTypesKey = enabledTypes.join(",");


  function cancelDeleteHold() {
    if (deleteHoldTimer.current) clearTimeout(deleteHoldTimer.current);
    deleteHoldTimer.current = null;
    setDeleteHoldingId(null);
  }

  function startDeleteHold(notificationId: string) {
    cancelDeleteHold();
    setDeleteHoldingId(notificationId);
    deleteHoldTimer.current = setTimeout(() => {
      deleteHoldTimer.current = null;
      setDeleteHoldingId(null);
      void deleteAndRefresh(notificationId);
    }, 2000);
  }

  function cancelClearHold() {
    if (clearHoldTimer.current) clearTimeout(clearHoldTimer.current);
    clearHoldTimer.current = null;
    setClearHolding(false);
  }

  async function clearEverything() {
    if (clearing) return;
    setClearing(true); setError("");
    try {
      await onClearAll();
      setHistory({ items: [], total: 0, page: 1, pages: 1, pageSize: 20 });
      setPage(1);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось очистить уведомления");
    } finally {
      setClearing(false);
    }
  }

  function startClearHold() {
    if (clearing || !allNotificationsCount) return;
    cancelClearHold();
    setClearHolding(true);
    clearHoldTimer.current = setTimeout(() => {
      clearHoldTimer.current = null;
      setClearHolding(false);
      void clearEverything();
    }, 2000);
  }

  useEffect(() => {
    const cancel = () => cancelClearHold();
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      if (deleteHoldTimer.current) clearTimeout(deleteHoldTimer.current);
      if (clearHoldTimer.current) clearTimeout(clearHoldTimer.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  }, []);

  useEffect(() => {
    if (filter !== "all" && !enabledTypes.includes(filter)) setFilter("all");
  }, [enabledTypesKey, filter]);

  useEffect(() => {
    let active = true;
    const types = filter === "all" ? enabledTypes : enabledTypes.filter((type) => type === filter);
    setLoading(true);
    const load = async () => {
      try {
        const result = await fetchNotificationHistory(page, types);
        if (!active) return;
        setHistory(result);
        setLoading(false);
        setError("");
        if (result.page !== page) setPage(result.page);
      } catch (cause) {
        if (!active) return;
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "Не удалось загрузить уведомления");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [page, filter, enabledTypesKey, reload]);

  async function deleteAndRefresh(notificationId: string) {
    await onDelete(notificationId);
    setReload((value) => value + 1);
  }


  return (
    <section className="notifications-module">
      <header className="notifications-module-head"><div className="page-heading"><span className="page-heading-icon"><Bell size={19} /></span><div className="page-heading-copy"><span className="eyebrow">ВАШИ СОБЫТИЯ</span><h2>Уведомления</h2></div></div><button className="action-button secondary notifications-module-back" aria-label="Вернуться в чат" onClick={onClose}><ArrowLeft size={16} />К чату</button></header><div className="notifications-module-body">
        <div className="notification-toolbar">
          <label className="notification-type-filter"><span>Тип уведомлений</span><span className="notification-select-wrap"><StyledSelect aria-label="Фильтр уведомлений по типу" value={filter} onChange={(event) => { setFilter(event.target.value as NotificationItem["type"] | "all"); setPage(1); }}><option value="all">Все типы</option>{notificationTypeOptions.filter(({ key }) => enabledTypes.includes(key)).map(({ key, title }) => <option key={key} value={key}>{title}</option>)}</StyledSelect></span></label>
          <button type="button" className={"notification-clear-all" + (clearHolding ? " holding" : "")} disabled={!allNotificationsCount || clearing} title="Удерживайте две секунды, чтобы удалить все уведомления, включая скрытые и находящиеся на других страницах" aria-label="Очистить все уведомления: удерживайте две секунды"
            onClick={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); startClearHold(); }}
            onPointerUp={cancelClearHold} onPointerLeave={cancelClearHold} onPointerCancel={cancelClearHold} onBlur={cancelClearHold}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!event.repeat) startClearHold(); } if (event.key === "Escape") cancelClearHold(); }}
            onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cancelClearHold(); } }}>
            <Trash2 size={16} /><span>{clearing ? "Очищаем…" : "Очистить всё"}</span>
          </button>
        </div>
        {error && <p className="notification-load-error" role="alert">{error}</p>}
        {loading && history.items.length === 0 ? <p className="notification-loading">Загрузка уведомлений…</p> : history.items.length === 0 ? (
          <div className="notification-empty"><span><Bell size={28} /></span><strong>Пока тихо</strong><p>Здесь появятся ответы, упоминания, подарки и другие важные события.</p></div>
        ) : (
          <div className="notification-list">
            {history.items.map((notification) => {
              const reaction = notification.reactionType ? reactions[notification.reactionType] : null;
              const canOpen = Boolean(notification.roomId || notification.peerId);
              return (
                <article className={"notification-row " + (notification.readAt ? "" : "unread")} key={notification.id}>
                  <Avatar value={notification.actor.avatar} name={notification.actor.name} />
                  <span className="notification-icon">{notification.type === "reply" ? <CornerUpLeft size={15} /> : notification.type === "mention" ? <AtSign size={15} /> : notification.type === "gift" ? <Gift size={15} /> : notification.type.includes("photo") ? <Image size={15} /> : notification.type.includes("mute") || notification.type.includes("ban") ? <ShieldAlert size={15} /> : notification.type.includes("profile") ? <MessageCircle size={15} /> : reaction?.emoji ?? <SmilePlus size={15} />}</span>
                  <span className="notification-copy">
                    <strong>{notification.actor.name}</strong>
                    <span>{labels[notification.type] + (notification.type === "reaction" && reaction ? ": " + reaction.label : "")}</span>
                    <small><span>{notification.preview || "Сообщение без текста"}</span><time>{new Date(notification.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></small>
                  </span>
                  <div className="notification-actions">
                    {canOpen && <button type="button" className="notification-action notification-view" aria-label="Открыть событие" title="Открыть событие" onClick={() => onOpen(notification)}><Eye size={15} /></button>}
                    <button type="button" className={"notification-action notification-delete " + (deleteHoldingId === notification.id ? "holding" : "")} aria-label="Удалить уведомление: удерживайте две секунды" title="Удерживайте две секунды для удаления" onClick={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => { event.preventDefault(); startDeleteHold(notification.id); }} onPointerUp={cancelDeleteHold} onPointerLeave={cancelDeleteHold} onPointerCancel={cancelDeleteHold} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) startDeleteHold(notification.id); }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") cancelDeleteHold(); }}><Trash2 size={15} /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {history.total > 0 && <nav className="notification-pages" aria-label="Страницы уведомлений"><span>{(history.page - 1) * history.pageSize + 1}–{Math.min(history.page * history.pageSize, history.total)} из {history.total}</span><div><button type="button" aria-label="Предыдущая страница" disabled={history.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></button><strong>{history.page} / {history.pages}</strong><button type="button" aria-label="Следующая страница" disabled={history.page >= history.pages || loading} onClick={() => setPage((value) => Math.min(history.pages, value + 1))}><ChevronRight size={17} /></button></div></nav>}
      </div>
    </section>
  );
}

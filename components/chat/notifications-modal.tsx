import { AtSign, Bell, CornerUpLeft, Gift, Heart, Image, MessageCircle, ShieldAlert, SmilePlus, X } from "lucide-react";
import type { NotificationItem, ReactionType } from "@/lib/chat-contract";
import { Avatar } from "./avatar";

const labels: Record<NotificationItem["type"], string> = { reply: "ответил(а) на ваше сообщение", mention: "упомянул(а) вас в сообщении", reaction: "оценил(а) ваше сообщение", gift: "отправил(а) вам подарок", profile_post: "оставил(а) запись на вашей стене", profile_post_reply: "ответил(а) на запись на стене", mute: "ограничил(а) вам отправку сообщений", unmute: "снял(а) ограничение на отправку", ban: "заблокировал(а) ваш аккаунт", unban: "разблокировал(а) ваш аккаунт", photo_like: "оценил(а) вашу фотографию", photo_comment: "прокомментировал(а) вашу фотографию" };

const reactions: Record<ReactionType, { emoji: string; label: string }> = {
  like: { emoji: "������", label: "нравится" },
  dislike: { emoji: "������", label: "не нравится" },
  laugh: { emoji: "������", label: "смешно" },
  disgust: { emoji: "������", label: "отвратительно" },
  love: { emoji: "❤️", label: "любовь" },
  surprise: { emoji: "������", label: "удивление" },
  sad: { emoji: "������", label: "грусть" },
};

type NotificationsModalProps = {
  notifications: NotificationItem[];
  onOpen: (notification: NotificationItem) => void;
  onClose: () => void;
};

export function NotificationsModal({ notifications, onOpen, onClose }: NotificationsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal notifications-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
        <h2>Уведомления</h2>
        {notifications.length === 0 ? (
          <div className="direct-empty"><Bell size={22} />Новых событий пока нет.</div>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const reaction = notification.reactionType ? reactions[notification.reactionType] : null;
              return (
                <button className={"notification-row " + (notification.readAt ? "" : "unread")} key={notification.id} onClick={() => onOpen(notification)}>
                  <Avatar value={notification.actor.avatar} name={notification.actor.name} />
                  <span className="notification-icon">{notification.type === "reply" ? <CornerUpLeft size={15} /> : notification.type === "mention" ? <AtSign size={15} /> : notification.type === "gift" ? <Gift size={15} /> : notification.type.includes("photo") ? <Image size={15} /> : notification.type.includes("mute") || notification.type.includes("ban") ? <ShieldAlert size={15} /> : notification.type.includes("profile") ? <MessageCircle size={15} /> : reaction?.emoji ?? <SmilePlus size={15} />}</span>
                  <span className="notification-copy">
                    <strong>{notification.actor.name}</strong>
                    <span>{labels[notification.type] + (notification.type === "reaction" && reaction ? ": " + reaction.label : "")}</span>
                    <small>{notification.preview || "Сообщение без текста"}</small>
                  </span>
                  <time>{new Date(notification.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

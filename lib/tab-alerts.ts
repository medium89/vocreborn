import type { NotificationItem } from "@/lib/chat-contract";

export type TabAlertPreferences = {
  direct: boolean;
  mentions: boolean;
  notifications: boolean;
  directPreview: boolean;
};

export const defaultTabAlertPreferences: TabAlertPreferences = {
  direct: true,
  mentions: true,
  notifications: true,
  directPreview: true,
};

export function loadTabAlertPreferences(userId: string): TabAlertPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem("aura:tab-alerts:" + userId) ?? "{}") as Partial<TabAlertPreferences>;
    return {
      direct: typeof saved.direct === "boolean" ? saved.direct : true,
      mentions: typeof saved.mentions === "boolean" ? saved.mentions : true,
      notifications: typeof saved.notifications === "boolean" ? saved.notifications : true,
      directPreview: typeof saved.directPreview === "boolean" ? saved.directPreview : true,
    };
  } catch {
    return { ...defaultTabAlertPreferences };
  }
}

export function saveTabAlertPreferences(userId: string, preferences: TabAlertPreferences) {
  localStorage.setItem("aura:tab-alerts:" + userId, JSON.stringify(preferences));
}

export type NotificationPreferences = Record<NotificationItem["type"], boolean>;

export const notificationTypeOptions: Array<{ key: NotificationItem["type"]; title: string; detail: string }> = [
  { key: "reply", title: "Ответы в чате", detail: "Ответы на ваши сообщения" },
  { key: "mention", title: "Упоминания в чате", detail: "Сообщения, в которых вас упомянули" },
  { key: "reaction", title: "Реакции на сообщения", detail: "Оценки ваших сообщений" },
  { key: "gift", title: "Подарки", detail: "Подарки от участников" },
  { key: "profile_post", title: "Записи на стене", detail: "Новые записи в вашем профиле" },
  { key: "profile_post_reply", title: "Ответы на стене", detail: "Ответы на записи в профиле" },
  { key: "photo_like", title: "Лайки фотографий", detail: "Оценки ваших фотографий" },
  { key: "photo_comment", title: "Комментарии к фото", detail: "Новые комментарии к фотографиям" },
  { key: "mute", title: "Ограничение сообщений", detail: "Уведомления о муте" },
  { key: "unmute", title: "Снятие ограничения", detail: "Уведомления о снятии мута" },
  { key: "ban", title: "Блокировка аккаунта", detail: "Уведомления о блокировке" },
  { key: "unban", title: "Разблокировка аккаунта", detail: "Уведомления о снятии блокировки" },
];

export const defaultNotificationPreferences: NotificationPreferences = Object.fromEntries(
  notificationTypeOptions.map(({ key }) => [key, true]),
) as NotificationPreferences;

export function loadNotificationPreferences(userId: string): NotificationPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem("aura:notification-preferences:" + userId) ?? "{}") as Partial<NotificationPreferences>;
    return Object.fromEntries(notificationTypeOptions.map(({ key }) => [key, typeof saved[key] === "boolean" ? saved[key] : true])) as NotificationPreferences;
  } catch {
    return { ...defaultNotificationPreferences };
  }
}

export function saveNotificationPreferences(userId: string, preferences: NotificationPreferences) {
  localStorage.setItem("aura:notification-preferences:" + userId, JSON.stringify(preferences));
}

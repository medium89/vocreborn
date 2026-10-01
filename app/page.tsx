"use client";
import "./admin.css";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { RadioPlayer } from "@/components/chat/radio-player";
import { RadioPage } from "@/components/chat/radio-page";
import { AdminModal } from "@/components/chat/admin-modal";
import { AuthModal, GuestRegistrationModal } from "@/components/chat/auth-modal";
import { Conversation } from "@/components/chat/conversation";
import { PeoplePanel } from "@/components/chat/people-panel";
import { PublicProfileModal } from "@/components/chat/public-profile-modal";
import { ReportModal } from "@/components/chat/report-modal";
import { ReportsModal } from "@/components/chat/reports-modal";
import { NotificationsPage } from "@/components/chat/notifications-modal";
import { ModerationModal, ProfilePage, RoomsModal } from "@/components/chat/modals";
import { UserEditorPage } from "@/components/chat/user-editor-page";
import { CommunitiesModal } from "@/components/chat/communities-modal";
import { CommunityChatPage } from "@/components/chat/community-chat-page";
import { GiftShopPage } from "@/components/chat/gift-shop-modal";
import { Sidebar } from "@/components/chat/sidebar";
import { SupportModal } from "@/components/chat/support-modal";

import { changePassword, getMe, logout, updateProfile, uploadAvatar } from "@/lib/auth-api";
import {
  API_URL,
  createRoom,
  fetchDirectConversations,
  fetchDirectMessagePage,
  fetchRoomMessagePage,
  fetchRooms,
  fetchUsers,
  markDirectRead,
  postDirectMessage,
  postRoomMessage,
  toggleMessageReaction,
  updateRoom,
  uploadRoomCover,
} from "@/lib/chat-api";
import type { Attachment, AuthUser, Community, DirectConversation, EconomyBalance, Message, NotificationItem, Person, ReactionType, ReactionUpdate, ReportReason, Room, UserStatus } from "@/lib/chat-contract";
import { createReport } from "@/lib/reports-api";
import { clearAllNotifications as clearAllNotificationsApi, fetchNotifications, markNotificationsRead, removeNotification } from "@/lib/notifications-api";
import { fetchCommunities, fetchCommunityMenuBadge, fetchEconomyBalance, fetchGiftCatalog, uploadAttachment } from "@/lib/social-api";
import { defaultNotificationPreferences, defaultTabAlertPreferences, notificationTypeOptions, loadNotificationPreferences, loadTabAlertPreferences, saveNotificationPreferences, saveTabAlertPreferences, type NotificationPreferences, type TabAlertPreferences } from "@/lib/tab-alerts";
import { banUser, deletePublicMessage, imposeChaos, muteUser, removeChaos, unbanUser, unmuteUser } from "@/lib/moderation-api";
import type { ChatGif } from "@/lib/gif-api";


type MessageCreated = { roomId: string; message: Message; requestId?: string };
type DirectCreated = { peerId: string; message: Message; requestId?: string };
type RoomSnapshot = { room: Room; messages: Message[]; people: Person[] };
type PrivateMessagePreview = { peerId: string; text: string };

const defaultRoom: Room = {
  id: "main",
  name: "Главная",
  description: "Общая комната сообщества",
  online: 0,
  memberCount: 0,
  tone: "lime",
  coverEmoji: "✦",
  coverUrl: undefined,
  coverThumbnailUrl: undefined,
  rules: "",
  visibility: "public",
  kind: "general",
  createdAt: new Date().toISOString(),
};

function createRequestId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (item) => item.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

const MAX_LOADED_MESSAGES = 150;

function appendUnique(items: Message[], message: Message) {
  return items.some((item) => item.id === message.id) ? items : [...items, message].slice(-MAX_LOADED_MESSAGES);
}

function mergeChronological(items: Message[], message: Message) {
  const next = items.some((item) => item.id === message.id)
    ? items.map((item) => item.id === message.id ? message : item)
    : [...items, message];
  return next.sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || String(left.id).localeCompare(String(right.id)));
}

function revealWindow(items: Message[], message: Message) {
  const ordered = mergeChronological(items, message);
  if (ordered.length <= MAX_LOADED_MESSAGES) return { items: ordered, droppedNewer: false };
  const index = ordered.findIndex((item) => item.id === message.id);
  const start = Math.min(Math.max(0, index - 20), ordered.length - MAX_LOADED_MESSAGES);
  return { items: ordered.slice(start, start + MAX_LOADED_MESSAGES), droppedNewer: start + MAX_LOADED_MESSAGES < ordered.length };
}



function applyReactionUpdate(message: Message, update: ReactionUpdate, currentUserId: string) {
  if (message.id !== update.messageId) return message;
  const mine = new Set((message.reactions ?? []).filter((reaction) => reaction.mine).map((reaction) => reaction.type));
  const ownUpdate = update.userId === currentUserId;
  return {
    ...message,
    reactions: update.reactions.map((reaction) => ({
      ...reaction,
      mine: ownUpdate ? update.selected === reaction.type : mine.has(reaction.type),
    })),
  };
}
function normalizeConversations(items: DirectConversation[], userId: string) {
  return items.map((item) => ({
    ...item,
    lastMessage: { ...item.lastMessage, mine: item.lastMessage.authorId === userId },
  }));
}

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestRegistrationOpen, setGuestRegistrationOpen] = useState(false);
  const [roomId, setRoomId] = useState("main");
  const [rooms, setRooms] = useState<Room[]>([defaultRoom]);
  const [chatPeople, setChatPeople] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [tabAlertPreferences, setTabAlertPreferences] = useState<TabAlertPreferences>(defaultTabAlertPreferences);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [unreadRoomMessages, setUnreadRoomMessages] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [direct, setDirect] = useState<Record<string, Message[]>>({});
  const [roomCursors, setRoomCursors] = useState<Record<string, string | null>>({});
  const [directCursors, setDirectCursors] = useState<Record<string, string | null>>({});
  const [roomHasNewer, setRoomHasNewer] = useState<Record<string, boolean>>({});
  const [directHasNewer, setDirectHasNewer] = useState<Record<string, boolean>>({});
  const roomHasNewerRef = useRef<Record<string, boolean>>({});
  const directHasNewerRef = useRef<Record<string, boolean>>({});
  const roomOldestRef = useRef<Record<string, Message>>({});
  const directOldestRef = useRef<Record<string, Message>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [adminVoice, setAdminVoice] = useState(false);
  const [mentionFocusRequest, setMentionFocusRequest] = useState(0);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [gif, setGif] = useState<ChatGif | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [dialog, setDialog] = useState<Person | null>(null);
  const [hiddenDirectIds, setHiddenDirectIds] = useState<Set<string>>(() => new Set());
  const [privateMessagePreview, setPrivateMessagePreview] = useState<PrivateMessagePreview | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const [communityChatOpen, setCommunityChatOpen] = useState(false);
  const [myCommunity, setMyCommunity] = useState<Community | null>(null);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [communityBadge, setCommunityBadge] = useState(0);
  const [shopBadge, setShopBadge] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [radioView, setRadioView] = useState<"requests" | "studio" | null>(null);
  const [radioControlsTarget, setRadioControlsTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const sync = () => setRadioView(window.location.pathname === "/radio/studio" ? "studio" : window.location.pathname === "/radio/requests" ? "requests" : null);
    sync(); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync);
  }, []);
  const [supportOpen, setSupportOpen] = useState(false);
  const [viewedProfile, setViewedProfile] = useState<Person | null>(null);
  const [reportTarget, setReportTarget] = useState<{ label: string; userId?: string; messageId?: string } | null>(null);
  const [moderationTarget, setModerationTarget] = useState<Person | null>(null);
  const [quickModerationTarget, setQuickModerationTarget] = useState<Person | null>(null);
  const [muted, setMuted] = useState(false);
  const [mutedPeople, setMutedPeople] = useState<Set<string>>(new Set());

  const [notice, setNotice] = useState("Проверка сессии…");
  const [errorNotice, setErrorNotice] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const tabAlertPreferencesRef = useRef<TabAlertPreferences>(defaultTabAlertPreferences);
  const notificationPreferencesRef = useRef<NotificationPreferences>(defaultNotificationPreferences);
  const tabAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabAlertCountRef = useRef(0);
  const seenNotificationsRef = useRef(new Map<string, string>());
  const notificationsBaselineReadyRef = useRef(false);
  const activeRoomRef = useRef(roomId);
  const activeDialogRef = useRef<string | null>(null);
  const peopleRef = useRef<Person[]>([]);
  const presenceStatusRef = useRef<UserStatus>("offline");
  const muteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privateMessagePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownRequests = useRef(new Set<string>());
  const economyRequestId = useRef(0);

  function markRoomNewer(key: string, value: boolean) {
    roomHasNewerRef.current[key] = value;
    setRoomHasNewer((old) => ({ ...old, [key]: value }));
  }
  function markDirectNewer(key: string, value: boolean) {
    directHasNewerRef.current[key] = value;
    setDirectHasNewer((old) => ({ ...old, [key]: value }));
  }
  useEffect(() => {
    for (const [key, items] of Object.entries(messages)) {
      const first = items[0];
      const previous = roomOldestRef.current[key];
      if (first && previous && items.length === MAX_LOADED_MESSAGES &&
          ((first.createdAt ?? "").localeCompare(previous.createdAt ?? "") || String(first.id).localeCompare(String(previous.id))) > 0) {
        setRoomCursors((old) => ({ ...old, [key]: String(first.id) }));
      }
      if (first) roomOldestRef.current[key] = first;
    }
  }, [messages]);
  useEffect(() => {
    for (const [key, items] of Object.entries(direct)) {
      const first = items[0];
      const previous = directOldestRef.current[key];
      if (first && previous && items.length === MAX_LOADED_MESSAGES &&
          ((first.createdAt ?? "").localeCompare(previous.createdAt ?? "") || String(first.id).localeCompare(String(previous.id))) > 0) {
        setDirectCursors((old) => ({ ...old, [key]: String(first.id) }));
      }
      if (first) directOldestRef.current[key] = first;
    }
  }, [direct]);

  function clearTabAlert() {
    if (tabAlertTimerRef.current) clearTimeout(tabAlertTimerRef.current);
    tabAlertTimerRef.current = null;
    tabAlertCountRef.current = 0;
    document.title = "TUSOVA — ночные разговоры";
  }

  function showTabAlert(kind: keyof TabAlertPreferences, label: string) {
    if (!tabAlertPreferencesRef.current[kind]) return;
    if (tabAlertTimerRef.current) clearTimeout(tabAlertTimerRef.current);
    tabAlertCountRef.current += 1;
    const count = tabAlertCountRef.current > 1 ? "(" + tabAlertCountRef.current + ") " : "";
    document.title = count + label.replace(/\s+/g, " ").slice(0, 70) + " · TUSOVA";
    if (!document.hidden && document.hasFocus()) tabAlertTimerRef.current = setTimeout(() => {
      tabAlertTimerRef.current = null;
      if (!document.hidden && document.hasFocus()) clearTabAlert();
    }, 10_000);
  }

  function changeTabAlertPreferences(next: TabAlertPreferences) {
    tabAlertPreferencesRef.current = next;
    setTabAlertPreferences(next);
    if (!next.directPreview) dismissPrivateMessagePreview();
    if (user) {
      try { saveTabAlertPreferences(user.id, next); }
      catch { showNotice("Не удалось сохранить настройки вкладки в браузере."); }
    }
    clearTabAlert();
  }

  function changeNotificationPreferences(next: NotificationPreferences) {
    notificationPreferencesRef.current = next;
    setNotificationPreferences(next);
    if (user) {
      try { saveNotificationPreferences(user.id, next); }
      catch { showNotice("Не удалось сохранить настройки уведомлений в браузере."); }
    }
    clearTabAlert();
  }

  useEffect(() => {
    seenNotificationsRef.current.clear();
    notificationsBaselineReadyRef.current = false;
    if (user) {
      const next = loadTabAlertPreferences(user.id);
      tabAlertPreferencesRef.current = next;
      setTabAlertPreferences(next);
      const notificationNext = loadNotificationPreferences(user.id);
      notificationPreferencesRef.current = notificationNext;
      setNotificationPreferences(notificationNext);
    } else {
      tabAlertPreferencesRef.current = defaultTabAlertPreferences;
      setTabAlertPreferences(defaultTabAlertPreferences);
      notificationPreferencesRef.current = defaultNotificationPreferences;
      setNotificationPreferences(defaultNotificationPreferences);
      seenNotificationsRef.current.clear();
      notificationsBaselineReadyRef.current = false;
      clearTabAlert();
    }
  }, [user?.id]);

  useEffect(() => {
    const resetOnReturn = () => { if (!document.hidden && document.hasFocus()) clearTabAlert(); };
    document.addEventListener("visibilitychange", resetOnReturn);
    window.addEventListener("focus", resetOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", resetOnReturn);
      window.removeEventListener("focus", resetOnReturn);
      clearTabAlert();
    };
  }, []);

  function applyEconomyBalance(balance: EconomyBalance, userId: string) {
    economyRequestId.current += 1;
    setUser((current) => current?.id === userId && (current.credits !== balance.credits || current.rating !== balance.rating)
      ? { ...current, credits: balance.credits, rating: balance.rating }
      : current);
  }

  async function refreshEconomy(userId?: string) {
    if (!userId) return;
    const requestId = ++economyRequestId.current;
    try {
      const balance = await fetchEconomyBalance();
      if (requestId === economyRequestId.current) applyEconomyBalance(balance, userId);
    } catch {
      // The next poll will retry; actions keep their own errors.
    }
  }

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    void refreshEconomy(userId);
    const timer = window.setInterval(() => void refreshEconomy(userId), 5_000);
    return () => { window.clearInterval(timer); economyRequestId.current += 1; };
  }, [user?.id]);

  function showNotice(message: string) {
    const isError = /не удалось|ошиб|недоступ|потеряно|не отправ|не подтверд|запрещен|заблокир|требуется|разрешены только|должн[ао] быть|сессия завершена|отклонил/i.test(message);
    if (isError) {
      setNotice("");
      setErrorNotice(message);
      return;
    }
    setNotice(message);
  }

  useEffect(() => {
    if (!errorNotice) return;
    const timer = window.setTimeout(() => setErrorNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [errorNotice]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function applyMutedUntil(mutedUntil: string | null) {
    if (muteTimerRef.current) clearTimeout(muteTimerRef.current);
    const remaining = mutedUntil ? new Date(mutedUntil).getTime() - Date.now() : 0;
    setMuted(remaining > 0);
    if (remaining > 0) {
      muteTimerRef.current = setTimeout(() => {
        setMuted(false);
        muteTimerRef.current = null;
      }, remaining);
    }
  }

  function dismissPrivateMessagePreview() {
    if (privateMessagePreviewTimerRef.current) clearTimeout(privateMessagePreviewTimerRef.current);
    privateMessagePreviewTimerRef.current = null;
    setPrivateMessagePreview(null);
  }

  function showPrivateMessagePreview(peerId: string, body: string) {
    if (!tabAlertPreferencesRef.current.directPreview) return;
    if (privateMessagePreviewTimerRef.current) clearTimeout(privateMessagePreviewTimerRef.current);
    setPrivateMessagePreview({ peerId, text: body.trim() || "Отправлено вложение" });
    privateMessagePreviewTimerRef.current = setTimeout(() => {
      setPrivateMessagePreview(null);
      privateMessagePreviewTimerRef.current = null;
    }, 7000);
  }

  async function loadSocialData(currentUser: AuthUser) {
    const [serverPeople, serverConversations, feed] = await Promise.all([
      fetchUsers(),
      fetchDirectConversations(),
      fetchNotifications(),
    ]);
    setChatPeople(serverPeople);
    setConversations(normalizeConversations(serverConversations, currentUser.id));
    for (const item of feed.items) {
      if (!seenNotificationsRef.current.has(item.id)) seenNotificationsRef.current.set(item.id, item.createdAt);
    }
    notificationsBaselineReadyRef.current = true;
    setNotifications(feed.items);
    setUnreadNotifications(feed.unread);
  }

  async function refreshNotifications(alertOnNew = false) {
    const feed = await fetchNotifications();
    const newItems = feed.items.filter((item) => !item.readAt && seenNotificationsRef.current.get(item.id) !== item.createdAt);
    for (const item of feed.items) seenNotificationsRef.current.set(item.id, item.createdAt);
    if (alertOnNew && notificationsBaselineReadyRef.current) {
      const item = newItems.find((entry) => notificationPreferencesRef.current[entry.type] && tabAlertPreferencesRef.current[entry.type === "mention" ? "mentions" : "notifications"]);
      if (item) {
        const actor = item.actor.name.trim() || "участника";
        showTabAlert(item.type === "mention" ? "mentions" : "notifications",
          item.type === "mention" ? "Упоминание от " + actor : "Новое уведомление от " + actor);
      }
    }
    notificationsBaselineReadyRef.current = true;
    setNotifications(feed.items);
    setUnreadNotifications(feed.unread);
  }

  function recordConversation(peerId: string, message: Message, mine: boolean) {
    let peer = peopleRef.current.find((person) => person.id === peerId);
    if (!peer && !mine) {
      peer = {
        id: peerId,
        name: message.author,
        status: "online",
        room: "main",
        avatar: message.author[0]?.toUpperCase() ?? "?",
        gender: "unspecified",
      };
    }
    if (!peer) {
      fetchDirectConversations()
        .then((items) => user && setConversations(normalizeConversations(items, user.id)))
        .catch(() => undefined);
      return;
    }

    const conversationPeer = peer;
    setConversations((old) => {
      const previous = old.find((item) => item.peer.id === peerId);
      const isOpen = activeDialogRef.current === peerId;
      const unread = mine ? (previous?.unread ?? 0) : isOpen ? 0 : (previous?.unread ?? 0) + 1;
      const next: DirectConversation = {
        peer: conversationPeer,
        lastMessage: { ...message, mine },
        unread,
        updatedAt: message.createdAt ?? new Date().toISOString(),
      };
      return [next, ...old.filter((item) => item.peer.id !== peerId)];
    });
  }

  useEffect(() => {
    peopleRef.current = chatPeople;
  }, [chatPeople]);

  useEffect(() => {
    const loadingTimeout = window.setTimeout(() => setAuthReady(true), 5_000);

    Promise.allSettled([getMe(), fetchRooms()]).then(([meResult, roomsResult]) => {
      if (meResult.status === "fulfilled") {
        setUser(meResult.value);
        applyMutedUntil(meResult.value.mutedUntil);
        loadSocialData(meResult.value).catch(() => showNotice("Не удалось загрузить пользователей и личные диалоги."));
      }
      if (roomsResult.status === "fulfilled") setRooms(roomsResult.value);
      showNotice(meResult.status === "fulfilled" ? "" : "Войдите или зарегистрируйтесь.");
      setAuthReady(true);
    }).finally(() => window.clearTimeout(loadingTimeout));

    return () => window.clearTimeout(loadingTimeout);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const socket = io(API_URL, { autoConnect: false, withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      showNotice("");
      socket.emit("room:join", { roomId: activeRoomRef.current });
    });
    socket.on("disconnect", () => {
      showNotice("Соединение потеряно. Пытаемся восстановить связь.");
    });
    socket.on("connect_error", (error) => {
      showNotice(error.message === "Требуется вход" ? "Сессия завершена. Войдите снова." : "Сервер недоступен.");
    });
    socket.on("room:snapshot", (snapshot: RoomSnapshot) => {
      if (snapshot.room.id !== activeRoomRef.current) return;
      const snapshotMessages = snapshot.messages.map((message) => ({
        ...message,
        mine: message.authorId ? message.authorId === user.id : message.author === user.displayName,
      }));
      if (!roomHasNewerRef.current[snapshot.room.id]) setMessages({ [snapshot.room.id]: snapshotMessages.slice(-MAX_LOADED_MESSAGES) });
    });
    socket.on("message:created", (payload: MessageCreated) => {
      const mine = payload.message.authorId === user.id || Boolean(payload.requestId && ownRequests.current.delete(payload.requestId));
      const message = mine ? { ...payload.message, mine: true } : payload.message;
      if (payload.roomId === activeRoomRef.current) {
        if (roomHasNewerRef.current[payload.roomId]) markRoomNewer(payload.roomId, true);
        else setMessages((old) => ({ ...old, [payload.roomId]: appendUnique(old[payload.roomId] ?? [], message) }));
      }
      if (!mine && (Boolean(activeDialogRef.current) || payload.roomId !== activeRoomRef.current)) setUnreadRoomMessages((old) => ({ ...old, [payload.roomId]: (old[payload.roomId] ?? 0) + 1 }));
    });
    socket.on("direct:created", (payload: DirectCreated) => {
      const mine = payload.message.authorId === user.id || Boolean(payload.requestId && ownRequests.current.delete(payload.requestId));
      const message = mine ? { ...payload.message, mine: true } : payload.message;
      if (payload.peerId === activeDialogRef.current) {
        if (directHasNewerRef.current[payload.peerId]) markDirectNewer(payload.peerId, true);
        else setDirect((old) => ({ ...old, [payload.peerId]: appendUnique(old[payload.peerId] ?? [], message) }));
      }
      recordConversation(payload.peerId, message, mine);
      if (!mine) {
        setChatPeople((old) => old.some((person) => person.id === payload.peerId) ? old : [...old, {
          id: payload.peerId,
          name: message.author,
          status: "online",
          room: activeRoomRef.current,
          avatar: message.author[0]?.toUpperCase() ?? "?",
        gender: "unspecified",
        }]);
        showPrivateMessagePreview(payload.peerId, message.body);
        showTabAlert("direct", "Личное сообщение от " + message.author);
      }
      if (!mine && activeDialogRef.current === payload.peerId) {
        markDirectRead(payload.peerId).catch(() => showNotice("Не удалось отметить сообщение прочитанным."));
      }
    });
    socket.on("message:deleted", (payload: { roomId: string; messageId: string }) => {
      setMessages((old) => ({
        ...old,
        [payload.roomId]: (old[payload.roomId] ?? []).filter((message) => message.id !== payload.messageId),
      }));
    });
    socket.on("reaction:updated", (payload: ReactionUpdate) => {
      setMessages((old) => Object.fromEntries(Object.entries(old).map(([key, items]) => [key, items.map((message) => applyReactionUpdate(message, payload, user.id))])));
      setDirect((old) => Object.fromEntries(Object.entries(old).map(([key, items]) => [key, items.map((message) => applyReactionUpdate(message, payload, user.id))])));
      setConversations((old) => old.map((item) => ({ ...item, lastMessage: applyReactionUpdate(item.lastMessage, payload, user.id) })));
    });
    socket.on("notification:changed", () => {
      refreshNotifications(true).catch(() => showNotice("Не удалось обновить уведомления."));
    });
    socket.on("moderation:changed", (payload: { mutedUntil: string | null; banned: boolean; actorName?: string }) => {
      if (payload.banned) {
        showNotice("Ваш аккаунт заблокирован администратором.");
        setUser(null);
        return;
      }
      applyMutedUntil(payload.mutedUntil);
      setUser((current) => current ? { ...current, mutedUntil: payload.mutedUntil } : current);
      showNotice(payload.mutedUntil ? "Вас замутил " + (payload.actorName ?? "модератор") + "." : "Ограничение на отправку снято.");
    });
    socket.on("chaos:changed", (payload: { chaosUntil: string | null; actorName?: string }) => {
      setUser((current) => current ? { ...current, chaosUntil: payload.chaosUntil } : current);
      showNotice(payload.chaosUntil
        ? "Вам назначен «Хаос» до " + new Date(payload.chaosUntil).toLocaleString("ru-RU") + ". Приват доступен."
        : "«Хаос» снят.");
    });
    socket.on("exception", (payload: { message?: string | string[] }) => {
      showNotice(Array.isArray(payload.message) ? payload.message[0] : payload.message ?? "Сервер отклонил действие.");
    });
    socket.on("presence:changed", (payload: { userId: string; status: UserStatus }) => {
      setChatPeople((old) => old.map((person) => person.id === payload.userId ? { ...person, status: payload.status } : person));
      setConversations((old) => old.map((item) => item.peer.id === payload.userId ? {
        ...item,
        peer: { ...item.peer, status: payload.status },
      } : item));
      if (payload.userId === user.id) {
        presenceStatusRef.current = payload.status;
        setUser((current) => current ? { ...current, status: payload.status } : current);
      }
    });
    socket.on("error", (error: { code?: string; message?: string }) => {
      if (error.code === "UNAUTHORIZED") setUser(null);
      showNotice(error.message ?? "Ошибка соединения в реальном времени.");
    });

    socket.on("economy:changed", () => { void refreshEconomy(user.id); });
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => () => {
    if (privateMessagePreviewTimerRef.current) clearTimeout(privateMessagePreviewTimerRef.current);
  }, []);

  useEffect(() => {
    if (!user) return;

    let awayTimer: ReturnType<typeof setTimeout>;
    const scheduleAway = () => {
      clearTimeout(awayTimer);
      if (presenceStatusRef.current === "away") {
        presenceStatusRef.current = "online";
        socketRef.current?.emit("presence:update", { status: "online" });
      }
      awayTimer = setTimeout(() => {
        if (presenceStatusRef.current === "online" && socketRef.current?.connected) {
          presenceStatusRef.current = "away";
          socketRef.current.emit("presence:update", { status: "away" });
        }
      }, 5 * 60 * 1000);
    };

    const events: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "mousemove", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, scheduleAway, { passive: true }));
    scheduleAway();

    return () => {
      clearTimeout(awayTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, scheduleAway));
    };
  }, [user?.id]);

  useEffect(() => {
    activeRoomRef.current = roomId;
    markRoomNewer(roomId, false);
    setMessages({});
    let active = true;
    const socket = socketRef.current;

    fetchRoomMessagePage(roomId)
      .then((page) => {
        if (!active) return;
        setRoomCursors((old) => ({ ...old, [roomId]: page.nextCursor }));
        const normalized = page.items.map((message) => ({
          ...message,
          mine: Boolean(user && (message.authorId ? message.authorId === user.id : message.author === user.displayName)),
        }));
        setMessages({ [roomId]: normalized.slice(-MAX_LOADED_MESSAGES) });
      })
      .catch(() => {
        if (active) showNotice("Не удалось загрузить историю комнаты.");
      });

    if (socket?.connected) socket.emit("room:join", { roomId });

    return () => {
      active = false;
      if (socket?.connected) socket.emit("room:leave", { roomId });
    };
  }, [roomId, user?.id, user?.displayName]);

  const room = rooms.find((item) => item.id === roomId) ?? defaultRoom;
  const currentMessages = dialog?.id ? (direct[dialog.id] ?? []) : (messages[roomId] ?? []);
  const currentPeople = useMemo(
    () => chatPeople.filter((person) => person.id === privateMessagePreview?.peerId || (person.status !== "offline" && (person.room === roomId || person.role === "admin"))).map((person) => person.id === user?.id ? { ...person, appearance: user?.appearance ?? person.appearance } : person),
    [chatPeople, roomId, privateMessagePreview?.peerId, user?.id, user?.appearance],
  );
  const unreadChatMessages = useMemo(() => Object.values(unreadRoomMessages).reduce((total, count) => total + count, 0), [unreadRoomMessages]);
  const unreadDirects = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unread, 0),
    [conversations],
  );

  const visibleDirectConversations = useMemo(
    () => conversations.filter((conversation) => !hiddenDirectIds.has(conversation.peer.id ?? "")),
    [conversations, hiddenDirectIds],
  );

  function leaveFullScreenSections() {
    setProfileOpen(false);
    setRadioView(null);
    if (window.location.pathname.startsWith("/radio/")) window.history.replaceState(window.history.state, "", "/");
    setNotificationsOpen(false);
    setCommunitiesOpen(false);
    setCommunityChatOpen(false);
    setGiftsOpen(false);
    setModerationTarget(null);
    setQuickModerationTarget(null);
    setReportsOpen(false);
    setAdminOpen(false);
  }

  function openRadio(mode: "requests" | "studio") {
    leaveFullScreenSections();
    setRadioView(mode);
    window.history.pushState(window.history.state, "", "/radio/" + mode);
  }

  function openOverlay(setOpen: (open: boolean) => void) {
    leaveFullScreenSections();
    setOpen(true);
  }

  function openDirects() {
    leaveFullScreenSections();
    const latest = conversations[0];
    if (!latest) {
      showNotice("Личных диалогов пока нет. Откройте профиль участника, чтобы начать переписку.");
      return;
    }
    void openDialog(latest.peer);
  }

  function refreshMenuBadges() {
    if (!user) { setCommunityBadge(0); setShopBadge(0); setMyCommunity(null); return; }
    void fetchCommunities().then((allCommunities) => setMyCommunity(allCommunities.find((community) => community.membership?.status === "approved") ?? null)).catch(() => setMyCommunity(null));
    void fetchCommunityMenuBadge().then((communities) => setCommunityBadge(communities.pendingRequests)).catch(() => setCommunityBadge(0));
    void fetchGiftCatalog().then((catalog) => { const key = "tusova:shop-seen-catalog:" + user.id; const legacyKey = "aura:shop-seen-catalog:" + user.id; const saved = window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey) ?? "[]"; if (!window.localStorage.getItem(key) && window.localStorage.getItem(legacyKey)) { window.localStorage.setItem(key, saved); window.localStorage.removeItem(legacyKey); } const seen = new Set<string>(JSON.parse(saved)); setShopBadge(catalog.filter((item) => !seen.has(item.id)).length); }).catch(() => setShopBadge(0));
  }

  function openGifts() {
    if (!user) { showNotice("Войдите, чтобы открыть магазин."); return; }
    openOverlay(setGiftsOpen);
    void fetchGiftCatalog().then((catalog) => {
      window.localStorage.setItem("tusova:shop-seen-catalog:" + user.id, JSON.stringify(catalog.map((item) => item.id)));
      setShopBadge(0);
    }).catch(() => undefined);
  }

  useEffect(() => { refreshMenuBadges(); }, [user?.id]);

  const visibleNotifications = notifications.filter((item) => notificationPreferences[item.type]);
  const visibleUnreadNotifications = Math.min(unreadNotifications, visibleNotifications.filter((item) => !item.readAt).length);

  function openNotifications() {
    leaveFullScreenSections();
    setNotificationsOpen(true);
    if (!visibleUnreadNotifications) return;
    const readAt = new Date().toISOString();
    setUnreadNotifications(0);
    setNotifications((old) => old.map((notification) => notification.readAt ? notification : { ...notification, readAt }));
    markNotificationsRead().catch(() => refreshNotifications().catch(() => showNotice("Не удалось отметить уведомления прочитанными.")));
  }

  function openNotification(notification: NotificationItem) {
    leaveFullScreenSections();
    if (notification.roomId) {
      changeRoom(notification.roomId);
      return;
    }
    const person = chatPeople.find((item) => item.id === notification.peerId)
      ?? conversations.find((item) => item.peer.id === notification.peerId)?.peer;
    if (person) {
      void openDialog(person);
      return;
    }
    showNotice("Связанный диалог больше недоступен.");
  }

  async function clearAllNotificationsForUser() {
    await clearAllNotificationsApi();
    setNotifications([]);
    setUnreadNotifications(0);
    seenNotificationsRef.current.clear();
    clearTabAlert();
  }

  async function deleteNotification(notificationId: string) {
    const target = notifications.find((notification) => notification.id === notificationId);
    setNotifications((items) => items.filter((notification) => notification.id !== notificationId));
    if (target && !target.readAt) setUnreadNotifications((count) => Math.max(0, count - 1));
    try {
      await removeNotification(notificationId);
    } catch {
      showNotice("Не удалось удалить уведомление.");
      void refreshNotifications();
    }
  }

  async function openDialog(person: Person) {
    dismissPrivateMessagePreview();
    if (!person.id || !user) {
      showNotice("Войдите, чтобы открыть серверный личный диалог.");
      return;
    }

    activeDialogRef.current = person.id;
    markDirectNewer(person.id, false);
    setDirect({});
    setDialog(person);
    setHiddenDirectIds((old) => {
      const next = new Set(old);
      next.delete(person.id as string);
      return next;
    });
    setReplyingTo(null);
    setConversations((old) => old.map((item) => item.peer.id === person.id ? { ...item, unread: 0 } : item));
    showNotice("Загрузка личной переписки…");
    try {
      const [page] = await Promise.all([
        fetchDirectMessagePage(person.id),
        markDirectRead(person.id),
      ]);
      setDirectCursors((old) => ({ ...old, [person.id as string]: page.nextCursor }));
      if (activeDialogRef.current === person.id) setDirect({
        [person.id]: page.items.map((message) => ({ ...message, mine: message.authorId === user.id })).slice(-MAX_LOADED_MESSAGES),
      });
      showNotice("");
    } catch {
      showNotice("Не удалось загрузить личную переписку.");
      fetchDirectConversations()
        .then((items) => setConversations(normalizeConversations(items, user.id)))
        .catch(() => undefined);
    }
  }

  function changeRoom(nextRoomId: string) {
    setUnreadRoomMessages((old) => old[nextRoomId] ? { ...old, [nextRoomId]: 0 } : old);
    activeDialogRef.current = null;
    setRoomId(nextRoomId);
    setDialog(null);
    setReplyingTo(null);
    setRoomsOpen(false);
    leaveFullScreenSections();
    showNotice("");
  }

  async function loadOlder() {
    if (loadingOlder || !user) return;
    const peerId = dialog?.id;
    setLoadingOlder(true);
    try {
      if (peerId) {
        const cursor = directCursors[peerId];
        if (!cursor) return;
        const page = await fetchDirectMessagePage(peerId, cursor);
        if (activeDialogRef.current !== peerId) return;
        const items = page.items.map((message) => ({ ...message, mine: message.authorId === user.id }));
        markDirectNewer(peerId, true);
        setDirect((old) => ({ [peerId]: [...items, ...(old[peerId] ?? [])].slice(0, MAX_LOADED_MESSAGES) }));
        setDirectCursors((old) => ({ ...old, [peerId]: page.nextCursor }));
      } else {
        const cursor = roomCursors[roomId];
        if (!cursor) return;
        const page = await fetchRoomMessagePage(roomId, cursor);
        if (activeRoomRef.current !== roomId || activeDialogRef.current) return;
        const items = page.items.map((message) => ({ ...message, mine: message.authorId === user.id }));
        markRoomNewer(roomId, true);
        setMessages((old) => ({ [roomId]: [...items, ...(old[roomId] ?? [])].slice(0, MAX_LOADED_MESSAGES) }));
        setRoomCursors((old) => ({ ...old, [roomId]: page.nextCursor }));
      }
    } catch {
      showNotice("Не удалось загрузить более ранние сообщения.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function showLatest() {
    if (loadingOlder || !user) return;
    const peerId = dialog?.id;
    setLoadingOlder(true);
    try {
      if (peerId) {
        const page = await fetchDirectMessagePage(peerId);
        if (activeDialogRef.current !== peerId) return;
        markDirectNewer(peerId, false);
        setDirect({ [peerId]: page.items.map((message) => ({ ...message, mine: message.authorId === user.id })) });
        setDirectCursors((old) => ({ ...old, [peerId]: page.nextCursor }));
      } else {
        const page = await fetchRoomMessagePage(roomId);
        if (activeRoomRef.current !== roomId || activeDialogRef.current) return;
        markRoomNewer(roomId, false);
        setMessages({ [roomId]: page.items.map((message) => ({ ...message, mine: message.authorId === user.id })) });
        setRoomCursors((old) => ({ ...old, [roomId]: page.nextCursor }));
      }
    } catch {
      showNotice("Не удалось вернуться к новым сообщениям.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleFileSelect(file: File) {
    const allowed = ["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm"];
    if (!allowed.includes(file.type)) { showNotice("Разрешены только PNG, JPEG, WebP, MP3, OGG, WAV и WebM."); return; }
    const image = file.type.startsWith("image/");
    if (file.size > (image ? 5 : 8) * 1024 * 1024) { showNotice(image ? "Изображение должно быть не больше 5 МБ." : "Аудио должно быть не больше 8 МБ."); return; }
    setUploadingAttachment(true); showNotice("Загрузка вложения…");
    try { setAttachment(await uploadAttachment(file)); showNotice("Вложение загружено и готово к отправке."); }
    catch (reason) { showNotice(reason instanceof Error ? reason.message : "Не удалось загрузить вложение."); }
    finally { setUploadingAttachment(false); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    const selectedAttachment = attachment;
    const selectedGif = gif;
    const selectedReply = replyingTo;
    const useAdminVoice = adminVoice && !dialog?.id && (user?.role === "admin" || user?.role === "moderator") && Boolean(body);
    if ((!body && !selectedAttachment && !selectedGif) || muted || !user) return;
    if (!dialog?.id && user.chaosUntil && new Date(user.chaosUntil).getTime() > Date.now()) {
      showNotice("Хаос: общий чат недоступен до " + new Date(user.chaosUntil).toLocaleString("ru-RU") + ". Личные сообщения доступны.");
      return;
    }
    setDraft("");
    setAttachment(null);
    setGif(null);
    setReplyingTo(null);

    const requestId = createRequestId();
    ownRequests.current.add(requestId);
    // HTTP is the authoritative send path: it stays reliable across Socket.IO reconnects.
    const socket = socketRef.current;
    const useRealtimeSend = false;

    if (dialog?.id) {
      if (useRealtimeSend && socket?.connected) {
        socket.emit("direct:send", { recipientId: dialog.id, body, requestId, attachmentId: selectedAttachment?.id, replyToId: typeof selectedReply?.id === "string" ? selectedReply.id : undefined }, (result: DirectCreated) => { if (!result?.message) { ownRequests.current.delete(requestId); setDraft(body); setAttachment(selectedAttachment); setGif(selectedGif); setReplyingTo(selectedReply); showNotice("Сервер не подтвердил личное сообщение."); return; } ownRequests.current.delete(requestId); const message = { ...result.message, mine: true }; if (directHasNewerRef.current[dialog.id as string]) void showLatest(); else setDirect((old) => ({ ...old, [dialog.id as string]: appendUnique(old[dialog.id as string] ?? [], message) })); recordConversation(dialog.id as string, message, true); });
        return;
      }

      try {
        const result = await postDirectMessage(dialog.id, body, requestId, selectedAttachment?.id, typeof selectedReply?.id === "string" ? selectedReply.id : undefined, selectedGif?.url);
        ownRequests.current.delete(requestId);
        const message = { ...result.message, mine: true };
        if (directHasNewerRef.current[dialog.id]) void showLatest();
        else setDirect((old) => ({ ...old, [dialog.id as string]: appendUnique(old[dialog.id as string] ?? [], message) }));
        recordConversation(dialog.id, message, true);
      } catch {
        ownRequests.current.delete(requestId);
        setDraft(body);
        setAttachment(selectedAttachment);
        setReplyingTo(selectedReply);
        showNotice("Личное сообщение не отправлено: проверьте сессию и сервер.");
      }
      return;
    }

    if (useRealtimeSend && socket?.connected) {
      socket.emit("message:send", { roomId, body, requestId, attachmentId: selectedAttachment?.id, replyToId: typeof selectedReply?.id === "string" ? selectedReply.id : undefined, adminVoice: useAdminVoice }, (result: MessageCreated) => { if (!result?.message) { ownRequests.current.delete(requestId); setDraft(body); setAttachment(selectedAttachment); setGif(selectedGif); setReplyingTo(selectedReply); showNotice("Сервер не подтвердил сообщение."); return; } ownRequests.current.delete(requestId); if (roomHasNewerRef.current[roomId]) void showLatest(); else setMessages((old) => ({ ...old, [roomId]: appendUnique(old[roomId] ?? [], { ...result.message, mine: true }) })); });
      return;
    }

    try {
      const result = await postRoomMessage(roomId, body, requestId, selectedAttachment?.id, typeof selectedReply?.id === "string" ? selectedReply.id : undefined, useAdminVoice, selectedGif?.url);
      ownRequests.current.delete(requestId);
      if (roomHasNewerRef.current[roomId]) void showLatest();
      else setMessages((old) => ({ ...old, [roomId]: appendUnique(old[roomId] ?? [], { ...result.message, mine: true }) }));
      void refreshEconomy(user.id);
    } catch {
      ownRequests.current.delete(requestId);
      setDraft(body);
      setAttachment(selectedAttachment);
      setReplyingTo(selectedReply);
      showNotice("Сообщение не отправлено: проверьте сессию и сервер.");
    }
  }

  function setPresenceStatus(status: "online" | "dnd") {
    presenceStatusRef.current = status;
    socketRef.current?.emit("presence:update", { status });
    setUser((current) => current ? { ...current, status } : current);
    showNotice(status === "dnd" ? "Режим «Не беспокоить» включён." : "Статус «В сети» включён.");
  }

  async function handleChangePassword(currentPassword: string, newPassword: string) {
    const updated = await changePassword(currentPassword, newPassword);
    setUser(updated);
    socketRef.current?.disconnect();
    socketRef.current?.connect();
    showNotice("Пароль изменён, остальные сессии завершены.");
  }

  async function submitReport(input: { userId?: string; messageId?: string; reason: ReportReason; details?: string }) {
    await createReport(input);
    showNotice("Жалоба отправлена модераторам.");
  }

  async function toggleQuickMute(person: Person, isMuted: boolean) {
    if (!person.id) return;
    if (isMuted) { await unmuteUser(person.id); setMutedPeople((items) => { const next = new Set(items); next.delete(person.id as string); return next; }); }
    else { await muteUser(person.id, 60, "Быстрый мут"); setMutedPeople((items) => new Set(items).add(person.id as string)); }
  }

  async function moderatePerson(target: Person | null, action: "mute" | "unmute" | "chaos" | "unchaos" | "ban" | "unban", durationMinutes: number, reason: string) {
    const targetId = target?.id;
    if (!targetId) throw new Error("Пользователь не выбран");
    if (action === "mute") await muteUser(targetId, durationMinutes, reason);
    if (action === "unmute") await unmuteUser(targetId);
    if (action === "chaos") await imposeChaos(targetId, durationMinutes, reason);
    if (action === "unchaos") await removeChaos(targetId);
    if (action === "ban") await banUser(targetId, durationMinutes, reason);
    if (action === "unban") await unbanUser(targetId);
    if (action === "mute" || action === "unmute") setMutedPeople((items) => {
      const next = new Set(items);
      if (action === "mute") next.add(targetId);
      else next.delete(targetId);
      return next;
    });
    showNotice("Действие модерации выполнено для " + target.name + ".");
  }

  function revealMessage(message: Message) {
    const normalized = { ...message, mine: message.authorId === user?.id };
    if (dialog?.id) {
      const current = direct[dialog.id] ?? [];
      const result = revealWindow(current, normalized);
      if (!current.some((item) => item.id === message.id)) {
        setDirectCursors((old) => ({ ...old, [dialog.id as string]: String(result.items[0].id) }));
        markDirectNewer(dialog.id, true);
      }
      setDirect({ [dialog.id]: result.items });
    } else {
      const current = messages[roomId] ?? [];
      const result = revealWindow(current, normalized);
      if (!current.some((item) => item.id === message.id)) {
        setRoomCursors((old) => ({ ...old, [roomId]: String(result.items[0].id) }));
        markRoomNewer(roomId, true);
      }
      setMessages({ [roomId]: result.items });
    }
  }

  async function handleReaction(messageId: string, type: ReactionType) {
    if (!user) return;
    try {
      const update = await toggleMessageReaction(messageId, type);
      setMessages((old) => Object.fromEntries(Object.entries(old).map(([key, items]) => [key, items.map((message) => applyReactionUpdate(message, update, user.id))])));
      setDirect((old) => Object.fromEntries(Object.entries(old).map(([key, items]) => [key, items.map((message) => applyReactionUpdate(message, update, user.id))])));
      setConversations((old) => old.map((item) => ({ ...item, lastMessage: applyReactionUpdate(item.lastMessage, update, user.id) })));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось сохранить реакцию.");
    }
  }
  async function handleDeleteMessage(messageId: string) {
    try {
      await deletePublicMessage(messageId);
      setMessages((old) => ({
        ...old,
        [roomId]: (old[roomId] ?? []).filter((message) => message.id !== messageId),
      }));
      showNotice("Сообщение удалено.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Не удалось удалить сообщение.");
    }
  }

  async function saveRoom(roomToEdit: string | null, input: { name: string; description: string; tone: string; coverEmoji: string; rules: string; visibility: "public" | "private"; coverFile: File | null }) {
    let saved = roomToEdit ? await updateRoom(roomToEdit, input) : await createRoom(input);
    if (input.coverFile) saved = await uploadRoomCover(saved.id, input.coverFile);
    setRooms((old) => roomToEdit ? old.map((room) => room.id === saved.id ? saved : room) : [...old, saved]);
    if (!roomToEdit) changeRoom(saved.id);
    showNotice(input.coverFile ? "Комната и обложка сохранены." : roomToEdit ? "Комната обновлена." : "Комната создана.");
  }

  async function saveProfile(input: { bio: string; gender: "male" | "female" | "unspecified" }, avatar: File | null) {
    let updated = await updateProfile(input);
    if (avatar) updated = await uploadAvatar(avatar);
    setUser(updated);
    await loadSocialData(updated);
    showNotice("Профиль сохранён.");
  }

  async function refreshFromServer() {
    try {
      const [serverRooms, roomMessages, currentUser] = await Promise.all([
        fetchRooms(),
        fetchRoomMessagePage(roomId),
        getMe(),
      ]);
      setRooms(serverRooms);
      setUser(currentUser);
      applyMutedUntil(currentUser.mutedUntil);
      await loadSocialData(currentUser);
      markRoomNewer(roomId, false);
      setRoomCursors((old) => ({ ...old, [roomId]: roomMessages.nextCursor }));
      setMessages({ [roomId]: roomMessages.items.map((message) => ({
        ...message,
        mine: message.authorId ? message.authorId === currentUser.id : message.author === currentUser.displayName,
      })) });
      showNotice("Данные обновлены с сервера.");
    } catch {
      showNotice("Не удалось обновить данные с сервера.");
    }
  }

  async function signOut() {
    try {
      await logout();
    } finally {
      activeDialogRef.current = null;
      presenceStatusRef.current = "offline";
      setUser(null);
      setDialog(null);
      setDirect({});
      setMessages({});
      setConversations([]);
      setNotifications([]);
      setUnreadNotifications(0);
        setNotificationsOpen(false);
      setModerationTarget(null);
      setQuickModerationTarget(null);
      setProfileOpen(false);
      setReportsOpen(false);
      setReportTarget(null);
      setAdminOpen(false);
      setViewedProfile(null);
      setAttachment(null);
      setReplyingTo(null);
      dismissPrivateMessagePreview();
      applyMutedUntil(null);
      setChatPeople([]);
      showNotice("Вы вышли из профиля.");
    }
  }

  function handleAuthenticated(authenticatedUser: AuthUser) {
    presenceStatusRef.current = authenticatedUser.status;
    setUser(authenticatedUser);
    applyMutedUntil(authenticatedUser.mutedUntil);
    showNotice("Вы вошли как " + authenticatedUser.displayName + ".");
    loadSocialData(authenticatedUser).catch(() => showNotice("Не удалось загрузить пользователей и личные диалоги."));
  }

  useEffect(() => {
    if (!user || new URLSearchParams(window.location.search).get("support") !== "1") return;
    setSupportOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("support");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [user]);

  if (!authReady) return <div className="tusova-loading" role="status" aria-label="Загрузка TUSOVA"><img src="/brand/tusova-chat-logo.png" alt="TUSOVA" /></div>;
  if (!user) return <AuthModal onAuthenticated={handleAuthenticated} />;
  return (
    <main className="shell">
      <Sidebar
        user={user}
        unreadDirects={unreadDirects}
        unreadNotifications={visibleUnreadNotifications}
        unreadChatMessages={unreadChatMessages}
        communityBadge={communityBadge}
        shopBadge={shopBadge}
        activeSection={profileOpen ? "profile" : radioView ? "radio" : adminOpen ? "admin" : reportsOpen ? "reports" : communityChatOpen ? "community-chat" : notificationsOpen ? "notifications" : communitiesOpen ? "communities" : giftsOpen ? "store" : "chat"}
        onOpenProfile={() => user && openOverlay(setProfileOpen)}
        onOpenRegistration={() => setGuestRegistrationOpen(true)}
        onSetStatus={setPresenceStatus}
        onLogout={() => void signOut()}
        onOpenChat={() => changeRoom(roomId)}
        onOpenDirects={openDirects}
        onOpenNotifications={openNotifications}
        onOpenRooms={() => openOverlay(setRoomsOpen)}
        communityChatName={myCommunity?.name ?? null}
        onOpenCommunityChat={() => { if (!myCommunity) return; leaveFullScreenSections(); setCommunityChatOpen(true); }}
        onOpenCommunities={() => user ? openOverlay(setCommunitiesOpen) : showNotice("Войдите, чтобы открыть сообщества.")}
        onOpenPeople={() => window.dispatchEvent(new Event("tusova:open-mobile-people"))}
        onOpenGifts={openGifts}
        onOpenReports={() => openOverlay(setReportsOpen)}
        onOpenAdmin={() => openOverlay(setAdminOpen)}
        onOpenRadio={() => openRadio("requests")}
        onNotice={showNotice}
      />
      {guestRegistrationOpen && <GuestRegistrationModal onAuthenticated={handleAuthenticated} onClose={() => setGuestRegistrationOpen(false)} />}
      <section className="app">
        <RadioPlayer user={user} controlsTarget={radioControlsTarget} />

        <div className={"layout" + (profileOpen ? " profile-layout" : "")}>
          {profileOpen && user ? <ProfilePage user={user} muted={muted} onAppearanceChanged={(appearance) => setUser((current) => current ? { ...current, appearance } : current)} tabAlertPreferences={tabAlertPreferences} onTabAlertPreferencesChange={changeTabAlertPreferences} notificationPreferences={notificationPreferences} onNotificationPreferencesChange={changeNotificationPreferences} onSave={saveProfile} onRefresh={() => void refreshFromServer()} onChangePassword={handleChangePassword} onClose={() => changeRoom(roomId)} /> : radioView && user ? <RadioPage user={user} mode={radioView} onMode={openRadio} onBack={() => changeRoom(roomId)} onBalance={balance => applyEconomyBalance(balance, user.id)} /> : moderationTarget && user ? <UserEditorPage key={moderationTarget.id} person={moderationTarget} actor={user} onBack={() => changeRoom(roomId)} onChanged={() => { void fetchUsers().then(setChatPeople).catch(() => showNotice("Не удалось обновить список пользователей.")); }} onModerate={(action, duration, reason) => moderatePerson(moderationTarget, action, duration, reason)} /> : communityChatOpen && myCommunity && user ? <CommunityChatPage community={myCommunity} user={user} rooms={rooms} roomId={roomId} mutedPeople={mutedPeople} onOpenProfile={setViewedProfile} onOpenPrivate={(person) => void openDialog(person)} onModerate={setModerationTarget} onReport={(person) => person.id && setReportTarget({ userId: person.id, label: "Пользователь " + person.name })} onChangeRoom={changeRoom} onOpenRooms={() => openOverlay(setRoomsOpen)} onBackToChat={() => changeRoom(roomId)} onToggleMute={(person, isMuted) => void toggleQuickMute(person, isMuted)} onAppearanceChanged={(appearance) => setUser((current) => current ? { ...current, appearance } : current)} /> : adminOpen && user?.role === "admin" ? <AdminModal user={user} rooms={rooms} onSaveRoom={saveRoom} onChangeRoom={changeRoom} onOpenRadio={() => openRadio("studio")} onUsersChanged={() => { void fetchUsers().then(setChatPeople).catch(() => showNotice("Не удалось обновить список пользователей.")); }} onBackToChat={() => changeRoom(roomId)} /> : reportsOpen && user && user.role !== "user" ? <ReportsModal canBan={user.role === "admin"} onBackToChat={() => changeRoom(roomId)} /> : notificationsOpen ? <NotificationsPage enabledTypes={notificationTypeOptions.filter(({ key }) => notificationPreferences[key]).map(({ key }) => key)} allNotificationsCount={notifications.length} onClearAll={clearAllNotificationsForUser} onOpen={openNotification} onDelete={deleteNotification} onClose={() => changeRoom(roomId)} /> : communitiesOpen && user ? <CommunitiesModal user={user} onBalanceChanged={() => refreshEconomy(user.id)} onBackToChat={() => changeRoom(roomId)} /> : giftsOpen && user ? <GiftShopPage user={user} people={chatPeople} onBackToChat={() => changeRoom(roomId)} onBalanceChanged={(balance) => applyEconomyBalance(balance, user.id)} onAppearanceChanged={(appearance) => setUser((current) => current ? { ...current, appearance } : current)} /> : <>
          <Conversation radioControlsRef={setRadioControlsTarget} currentUserId={user?.id} canUseAdminVoice={user?.role === "admin" || user?.role === "moderator"} adminVoice={adminVoice} onAdminVoiceChange={setAdminVoice} appearance={user?.appearance} onAppearanceChanged={(appearance) => setUser((current) => current ? { ...current, appearance } : current)} room={room} dialog={dialog?.name ?? null} dialogId={dialog?.id ?? null} directConversations={visibleDirectConversations} onOpenDirect={(person) => void openDialog(person)} onDismissDirect={(personId) => setHiddenDirectIds((old) => new Set(old).add(personId))} messages={currentMessages} draft={draft} muted={muted || !user} attachment={attachment} gif={gif} replyingTo={replyingTo} uploadingAttachment={uploadingAttachment} canDelete={user?.role === "admin" || user?.role === "moderator"} canReport={Boolean(user)} canReact={Boolean(user)} hasOlder={dialog?.id ? Boolean(directCursors[dialog.id]) : Boolean(roomCursors[roomId])} hasNewer={dialog?.id ? Boolean(directHasNewer[dialog.id]) : Boolean(roomHasNewer[roomId])} loadingOlder={loadingOlder} notice={notice} onDraftChange={setDraft} onSend={send} onLoadOlder={() => void loadOlder()} onShowLatest={() => void showLatest()} onFileSelect={(file) => void handleFileSelect(file)} onRemoveAttachment={() => setAttachment(null)} onGifSelect={setGif} onRemoveGif={() => setGif(null)} onReply={setReplyingTo} onCancelReply={() => setReplyingTo(null)} onDelete={(messageId) => void handleDeleteMessage(messageId)} onReact={handleReaction} onRevealMessage={revealMessage} onReport={(messageId, label) => setReportTarget({ messageId, label })} onNotice={showNotice} onExitDialog={() => changeRoom(roomId)} mentionCandidates={currentPeople} mentionFocusRequest={mentionFocusRequest} />
          </>}
          {!profileOpen && (moderationTarget || !(communityChatOpen && myCommunity && user)) && <PeoplePanel showMobileToggle={!moderationTarget && !adminOpen && !reportsOpen && !notificationsOpen && !communitiesOpen && !giftsOpen} people={currentPeople} rooms={rooms} roomId={roomId} currentUserId={user?.id ?? null} canModerate={user?.role === "admin" || user?.role === "moderator"} privateMessagePreview={privateMessagePreview} onOpenDialog={setViewedProfile} onMention={(person) => { leaveFullScreenSections(); const prefix = "@" + (person.username ?? person.name) + ": "; setDraft((current) => current + (current && !current.endsWith(" ") ? " " : "") + prefix); setMentionFocusRequest((value) => value + 1); }} onOpenPrivate={(person) => { leaveFullScreenSections(); void openDialog(person); }} onModerate={setQuickModerationTarget} onReport={(person) => person.id && setReportTarget({ userId: person.id, label: "Пользователь " + person.name })} onChangeRoom={changeRoom} onOpenRooms={() => openOverlay(setRoomsOpen)} mutedPeople={mutedPeople} onToggleMute={(person, isMuted) => void toggleQuickMute(person, isMuted)} />}
        </div>
      </section>
      {roomsOpen && <RoomsModal rooms={rooms} user={user} onChangeRoom={changeRoom} onSaveRoom={saveRoom} onClose={() => setRoomsOpen(false)} />}
      {reportTarget && user && <ReportModal target={reportTarget} onSubmit={submitReport} onClose={() => setReportTarget(null)} />}
      {quickModerationTarget && (user?.role === "admin" || user?.role === "moderator") && <ModerationModal key={quickModerationTarget.id} person={quickModerationTarget} canBan={user.role === "admin"} onAction={(action, duration, reason) => moderatePerson(quickModerationTarget, action, duration, reason)} onClose={() => setQuickModerationTarget(null)} />}
      {viewedProfile && user && <PublicProfileModal person={viewedProfile} currentUser={user} onOpenFriend={setViewedProfile} onBalanceChanged={() => void refreshEconomy(user.id)} onWriteDirect={async () => { const person = viewedProfile; await openDialog(person); setViewedProfile(null); }} onClose={() => setViewedProfile(null)} />}
      {notice && <div className="chat-info-toast" role="status"><span>{notice}</span><button type="button" aria-label="Закрыть уведомление" title="Закрыть" onClick={() => setNotice("")}>×</button></div>}
      {errorNotice && <div className="chat-error-backdrop" role="presentation" onMouseDown={() => setErrorNotice("")}><section className="chat-error-modal" role="alertdialog" aria-modal="true" aria-label="Ошибка" onMouseDown={(event) => event.stopPropagation()}><button type="button" aria-label="Закрыть ошибку" title="Закрыть" onClick={() => setErrorNotice("")}>×</button><strong>Не удалось выполнить действие</strong><p>{errorNotice}</p></section></div>}
      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
    </main>
  );
}

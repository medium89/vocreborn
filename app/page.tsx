"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { AdminModal } from "@/components/chat/admin-modal";
import { AuthModal } from "@/components/chat/auth-modal";
import { Conversation } from "@/components/chat/conversation";
import { PeoplePanel } from "@/components/chat/people-panel";
import { PublicProfileModal } from "@/components/chat/public-profile-modal";
import { ReportModal } from "@/components/chat/report-modal";
import { ReportsModal } from "@/components/chat/reports-modal";
import { NotificationsModal } from "@/components/chat/notifications-modal";
import { ModerationModal, ProfileModal, RoomsModal } from "@/components/chat/modals";
import { CommunitiesModal } from "@/components/chat/communities-modal";
import { GiftShopModal } from "@/components/chat/gift-shop-modal";
import { Sidebar } from "@/components/chat/sidebar";

import { changePassword, getMe, logout, updateProfile, uploadAvatar } from "@/lib/auth-api";
import {
  API_URL,
  createRoom,
  fetchDirectConversations,
  fetchDirectMessagePage,
  fetchDirectMessages,
  fetchRoomMessagePage,
  fetchRoomMessages,
  fetchRooms,
  fetchUsers,
  markDirectRead,
  postDirectMessage,
  postRoomMessage,
  toggleMessageReaction,
  updateRoom,
  uploadRoomCover,
} from "@/lib/chat-api";
import type { Attachment, AuthUser, DirectConversation, Message, NotificationItem, Person, ReactionType, ReactionUpdate, ReportReason, Room, UserStatus } from "@/lib/chat-contract";
import { createReport } from "@/lib/reports-api";
import { fetchNotifications, markNotificationsRead } from "@/lib/notifications-api";
import { uploadAttachment } from "@/lib/social-api";
import { banUser, deletePublicMessage, muteUser, unbanUser, unmuteUser } from "@/lib/moderation-api";


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

function appendUnique(items: Message[], message: Message) {
  return items.some((item) => item.id === message.id) ? items : [...items, message];
}

function mergeChronological(items: Message[], message: Message) {
  const next = items.some((item) => item.id === message.id)
    ? items.map((item) => item.id === message.id ? message : item)
    : [...items, message];
  return next.sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? ""));
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
  const [roomId, setRoomId] = useState("main");
  const [rooms, setRooms] = useState<Room[]>([defaultRoom]);
  const [chatPeople, setChatPeople] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [direct, setDirect] = useState<Record<string, Message[]>>({});
  const [roomCursors, setRoomCursors] = useState<Record<string, string | null>>({});
  const [directCursors, setDirectCursors] = useState<Record<string, string | null>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [mentionFocusRequest, setMentionFocusRequest] = useState(0);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [dialog, setDialog] = useState<Person | null>(null);
  const [hiddenDirectIds, setHiddenDirectIds] = useState<Set<string>>(() => new Set());
  const [privateMessagePreview, setPrivateMessagePreview] = useState<PrivateMessagePreview | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [viewedProfile, setViewedProfile] = useState<Person | null>(null);
  const [reportTarget, setReportTarget] = useState<{ label: string; userId?: string; messageId?: string } | null>(null);
  const [moderationTarget, setModerationTarget] = useState<Person | null>(null);
  const [muted, setMuted] = useState(false);
  const [mutedPeople, setMutedPeople] = useState<Set<string>>(new Set());

  const [notice, setNotice] = useState("Проверка сессии…");
  const [errorNotice, setErrorNotice] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const activeRoomRef = useRef(roomId);
  const activeDialogRef = useRef<string | null>(null);
  const peopleRef = useRef<Person[]>([]);
  const presenceStatusRef = useRef<UserStatus>("offline");
  const muteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privateMessagePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownRequests = useRef(new Set<string>());

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
    setNotifications(feed.items);
    setUnreadNotifications(feed.unread);
  }

  async function refreshNotifications() {
    const feed = await fetchNotifications();
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
      const snapshotMessages = snapshot.messages.map((message) => ({
        ...message,
        mine: message.authorId ? message.authorId === user.id : message.author === user.displayName,
      }));
      setMessages((old) => ({ ...old, [snapshot.room.id]: snapshotMessages }));
    });
    socket.on("message:created", (payload: MessageCreated) => {
      const mine = payload.message.authorId === user.id || Boolean(payload.requestId && ownRequests.current.delete(payload.requestId));
      const message = mine ? { ...payload.message, mine: true } : payload.message;
      setMessages((old) => ({
        ...old,
        [payload.roomId]: appendUnique(old[payload.roomId] ?? [], message),
      }));
    });
    socket.on("direct:created", (payload: DirectCreated) => {
      const mine = payload.message.authorId === user.id || Boolean(payload.requestId && ownRequests.current.delete(payload.requestId));
      const message = mine ? { ...payload.message, mine: true } : payload.message;
      setDirect((old) => ({
        ...old,
        [payload.peerId]: appendUnique(old[payload.peerId] ?? [], message),
      }));
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
      refreshNotifications().catch(() => showNotice("Не удалось обновить уведомления."));
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
        setMessages((old) => ({ ...old, [roomId]: normalized }));
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
    () => chatPeople.filter((person) => person.id === privateMessagePreview?.peerId || (person.status !== "offline" && (person.room === roomId || person.role === "admin"))),
    [chatPeople, roomId, privateMessagePreview?.peerId],
  );
  const unreadDirects = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unread, 0),
    [conversations],
  );

  const visibleDirectConversations = useMemo(
    () => conversations.filter((conversation) => !hiddenDirectIds.has(conversation.peer.id ?? "")),
    [conversations, hiddenDirectIds],
  );

  function openDirects() {
    const latest = conversations[0];
    if (!latest) {
      showNotice("Личных диалогов пока нет. Откройте профиль участника, чтобы начать переписку.");
      return;
    }
    void openDialog(latest.peer);
  }

  function openNotifications() {
    setNotificationsOpen(true);
    if (!unreadNotifications) return;
    const readAt = new Date().toISOString();
    setUnreadNotifications(0);
    setNotifications((old) => old.map((notification) => notification.readAt ? notification : { ...notification, readAt }));
    markNotificationsRead().catch(() => refreshNotifications().catch(() => showNotice("Не удалось отметить уведомления прочитанными.")));
  }

  function openNotification(notification: NotificationItem) {
    setNotificationsOpen(false);
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

  async function openDialog(person: Person) {
    dismissPrivateMessagePreview();
    if (!person.id || !user) {
      showNotice("Войдите, чтобы открыть серверный личный диалог.");
      return;
    }

    activeDialogRef.current = person.id;
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
      setDirect((old) => ({
        ...old,
        [person.id as string]: page.items.map((message) => ({ ...message, mine: message.authorId === user.id })),
      }));
      showNotice("");
    } catch {
      showNotice("Не удалось загрузить личную переписку.");
      fetchDirectConversations()
        .then((items) => setConversations(normalizeConversations(items, user.id)))
        .catch(() => undefined);
    }
  }

  function changeRoom(nextRoomId: string) {
    activeDialogRef.current = null;
    setRoomId(nextRoomId);
    setDialog(null);
    setReplyingTo(null);
    setRoomsOpen(false);
    showNotice("");
  }

  async function loadOlder() {
    if (loadingOlder || !user) return;
    setLoadingOlder(true);
    try {
      if (dialog?.id) {
        const cursor = directCursors[dialog.id];
        if (!cursor) return;
        const page = await fetchDirectMessagePage(dialog.id, cursor);
        const items = page.items.map((message) => ({ ...message, mine: message.authorId === user.id }));
        setDirect((old) => ({ ...old, [dialog.id as string]: [...items, ...(old[dialog.id as string] ?? [])] }));
        setDirectCursors((old) => ({ ...old, [dialog.id as string]: page.nextCursor }));
      } else {
        const cursor = roomCursors[roomId];
        if (!cursor) return;
        const page = await fetchRoomMessagePage(roomId, cursor);
        const items = page.items.map((message) => ({ ...message, mine: message.authorId === user.id }));
        setMessages((old) => ({ ...old, [roomId]: [...items, ...(old[roomId] ?? [])] }));
        setRoomCursors((old) => ({ ...old, [roomId]: page.nextCursor }));
      }
    } catch {
      showNotice("Не удалось загрузить более ранние сообщения.");
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
    const selectedReply = replyingTo;
    if ((!body && !selectedAttachment) || muted || !user) return;
    setDraft("");
    setAttachment(null);
    setReplyingTo(null);

    const requestId = createRequestId();
    ownRequests.current.add(requestId);
    // HTTP is the authoritative send path: it stays reliable across Socket.IO reconnects.
    const socket = socketRef.current;
    const useRealtimeSend = false;

    if (dialog?.id) {
      if (useRealtimeSend && socket?.connected) {
        socket.emit("direct:send", { recipientId: dialog.id, body, requestId, attachmentId: selectedAttachment?.id, replyToId: typeof selectedReply?.id === "string" ? selectedReply.id : undefined }, (result: DirectCreated) => { if (!result?.message) { ownRequests.current.delete(requestId); setDraft(body); setAttachment(selectedAttachment); setReplyingTo(selectedReply); showNotice("Сервер не подтвердил личное сообщение."); return; } ownRequests.current.delete(requestId); const message = { ...result.message, mine: true }; setDirect((old) => ({ ...old, [dialog.id as string]: appendUnique(old[dialog.id as string] ?? [], message) })); recordConversation(dialog.id as string, message, true); });
        return;
      }

      try {
        const result = await postDirectMessage(dialog.id, body, requestId, selectedAttachment?.id, typeof selectedReply?.id === "string" ? selectedReply.id : undefined);
        ownRequests.current.delete(requestId);
        const message = { ...result.message, mine: true };
        setDirect((old) => ({
          ...old,
          [dialog.id as string]: appendUnique(old[dialog.id as string] ?? [], message),
        }));
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
      socket.emit("message:send", { roomId, body, requestId, attachmentId: selectedAttachment?.id, replyToId: typeof selectedReply?.id === "string" ? selectedReply.id : undefined }, (result: MessageCreated) => { if (!result?.message) { ownRequests.current.delete(requestId); setDraft(body); setAttachment(selectedAttachment); setReplyingTo(selectedReply); showNotice("Сервер не подтвердил сообщение."); return; } ownRequests.current.delete(requestId); setMessages((old) => ({ ...old, [roomId]: appendUnique(old[roomId] ?? [], { ...result.message, mine: true }) })); });
      return;
    }

    try {
      const result = await postRoomMessage(roomId, body, requestId, selectedAttachment?.id, typeof selectedReply?.id === "string" ? selectedReply.id : undefined);
      ownRequests.current.delete(requestId);
      setMessages((old) => ({
        ...old,
        [roomId]: appendUnique(old[roomId] ?? [], { ...result.message, mine: true }),
      }));
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

  async function moderateTarget(action: "mute" | "unmute" | "ban" | "unban", durationMinutes: number, reason: string) {
    const targetId = moderationTarget?.id;
    if (!targetId) throw new Error("Пользователь не выбран");
    if (action === "mute") await muteUser(targetId, durationMinutes, reason);
    if (action === "unmute") await unmuteUser(targetId);
    if (action === "ban") await banUser(targetId, durationMinutes, reason);
    if (action === "unban") await unbanUser(targetId);
    showNotice("Действие модерации выполнено для " + moderationTarget.name + ".");
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
        fetchRoomMessages(roomId),
        getMe(),
      ]);
      setRooms(serverRooms);
      setUser(currentUser);
      applyMutedUntil(currentUser.mutedUntil);
      await loadSocialData(currentUser);
      setMessages((old) => ({
        ...old,
        [roomId]: roomMessages.map((message) => ({
          ...message,
          mine: message.authorId ? message.authorId === currentUser.id : message.author === currentUser.displayName,
        })),
      }));
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

  return (
    <main className="shell">
      <Sidebar
        user={user}
        unreadDirects={unreadDirects}
        unreadNotifications={unreadNotifications}
        directActive={Boolean(dialog)}
        onOpenProfile={() => user && setProfileOpen(true)}
        onSetStatus={setPresenceStatus}
        onLogout={() => void signOut()}
        onOpenChat={() => changeRoom(roomId)}
        onOpenDirects={openDirects}
        onOpenNotifications={openNotifications}
        onOpenRooms={() => setRoomsOpen(true)}
        onOpenCommunities={() => user ? setCommunitiesOpen(true) : showNotice("Войдите, чтобы открыть сообщества.")}
        onOpenGifts={() => user ? setGiftsOpen(true) : showNotice("Войдите, чтобы открыть подарки.")}
        onOpenReports={() => setReportsOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
        onNotice={showNotice}
      />
      <section className="app">

        <div className="layout">
          <Conversation currentUserId={user?.id} room={room} dialog={dialog?.name ?? null} dialogId={dialog?.id ?? null} directConversations={visibleDirectConversations} onOpenDirect={(person) => void openDialog(person)} onDismissDirect={(personId) => setHiddenDirectIds((old) => new Set(old).add(personId))} messages={currentMessages} draft={draft} muted={muted || !user} attachment={attachment} replyingTo={replyingTo} uploadingAttachment={uploadingAttachment} canDelete={user?.role === "admin" || user?.role === "moderator"} canReport={Boolean(user)} canReact={Boolean(user)} hasOlder={dialog?.id ? Boolean(directCursors[dialog.id]) : Boolean(roomCursors[roomId])} loadingOlder={loadingOlder} notice={notice} onDraftChange={setDraft} onSend={send} onLoadOlder={() => void loadOlder()} onFileSelect={(file) => void handleFileSelect(file)} onRemoveAttachment={() => setAttachment(null)} onReply={setReplyingTo} onCancelReply={() => setReplyingTo(null)} onDelete={(messageId) => void handleDeleteMessage(messageId)} onReact={handleReaction} onRevealMessage={(message) => { const normalized = { ...message, mine: message.authorId === user?.id }; if (dialog?.id) setDirect((old) => ({ ...old, [dialog.id as string]: mergeChronological(old[dialog.id as string] ?? [], normalized) })); else setMessages((old) => ({ ...old, [roomId]: mergeChronological(old[roomId] ?? [], normalized) })); }} onReport={(messageId, label) => setReportTarget({ messageId, label })} onNotice={showNotice} onExitDialog={() => changeRoom(roomId)} mentionCandidates={currentPeople} mentionFocusRequest={mentionFocusRequest} />
          <PeoplePanel people={currentPeople} rooms={rooms} roomId={roomId} currentUserId={user?.id ?? null} canModerate={user?.role === "admin" || user?.role === "moderator"} privateMessagePreview={privateMessagePreview} onOpenDialog={setViewedProfile} onMention={(person) => { const prefix = "@" + (person.username ?? person.name) + ": "; setDraft((current) => current + (current && !current.endsWith(" ") ? " " : "") + prefix); setMentionFocusRequest((value) => value + 1); }} onOpenPrivate={(person) => void openDialog(person)} onModerate={setModerationTarget} onReport={(person) => person.id && setReportTarget({ userId: person.id, label: "Пользователь " + person.name })} onChangeRoom={changeRoom} onOpenRooms={() => setRoomsOpen(true)} mutedPeople={mutedPeople} onToggleMute={(person, isMuted) => void toggleQuickMute(person, isMuted)} />
        </div>
      </section>
      {giftsOpen && user && <GiftShopModal user={user} people={chatPeople} onClose={() => setGiftsOpen(false)} />}
      {communitiesOpen && user && <CommunitiesModal user={user} onClose={() => setCommunitiesOpen(false)} />}
      {roomsOpen && <RoomsModal rooms={rooms} user={user} onChangeRoom={changeRoom} onSaveRoom={saveRoom} onClose={() => setRoomsOpen(false)} />}
      {notificationsOpen && <NotificationsModal notifications={notifications} onOpen={openNotification} onClose={() => setNotificationsOpen(false)} />}
      {moderationTarget && user && <ModerationModal person={moderationTarget} canBan={user.role === "admin"} onAction={moderateTarget} onClose={() => setModerationTarget(null)} />}
      {profileOpen && user && <ProfileModal user={user} muted={muted} onSave={saveProfile} onRefresh={() => void refreshFromServer()} onChangePassword={handleChangePassword} onClose={() => setProfileOpen(false)} />}
      {reportTarget && user && <ReportModal target={reportTarget} onSubmit={submitReport} onClose={() => setReportTarget(null)} />}
      {reportsOpen && user && user.role !== "user" && <ReportsModal onClose={() => setReportsOpen(false)} />}
      {viewedProfile && user && <PublicProfileModal person={viewedProfile} currentUser={user} onWriteDirect={async () => { const person = viewedProfile; await openDialog(person); setViewedProfile(null); }} onClose={() => setViewedProfile(null)} />}
      {adminOpen && user?.role === "admin" && <AdminModal onOpenRooms={() => { setAdminOpen(false); setRoomsOpen(true); }} onOpenReports={() => { setAdminOpen(false); setReportsOpen(true); }} onClose={() => setAdminOpen(false)} />}
      {notice && <div className="chat-info-toast" role="status"><span>{notice}</span><button type="button" aria-label="Закрыть уведомление" title="Закрыть" onClick={() => setNotice("")}>×</button></div>}
      {errorNotice && <div className="chat-error-backdrop" role="presentation" onMouseDown={() => setErrorNotice("")}><section className="chat-error-modal" role="alertdialog" aria-modal="true" aria-label="Ошибка" onMouseDown={(event) => event.stopPropagation()}><button type="button" aria-label="Закрыть ошибку" title="Закрыть" onClick={() => setErrorNotice("")}>×</button><strong>Не удалось выполнить действие</strong><p>{errorNotice}</p></section></div>}
      {authReady && !user && <AuthModal onAuthenticated={handleAuthenticated} />}
    </main>
  );
}

"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEventHandler } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, AtSign, ChevronDown, Ellipsis, FileAudio, FileImage, Flag, LoaderCircle, Maximize2, Mic, Paperclip, Pause, Play, Reply, Search, Send, Smile, SmilePlus, Square, Trash2, Users, X } from "lucide-react";
import { API_URL, fetchDirectResources, fetchRoomMessage, fetchRoomResources, searchDirectMessages, searchRoomMessages } from "@/lib/chat-api";
import type { Attachment, DirectConversation, Message, Person, ReactionType, Room, RoomResources } from "@/lib/chat-contract";
import { Avatar } from "./avatar";

const reactionOptions: Array<{ type: ReactionType; emoji: string; label: string }> = [
  { type: "like", emoji: "👍", label: "Нравится" },
  { type: "dislike", emoji: "👎", label: "Не нравится" },
  { type: "laugh", emoji: "😂", label: "Смешно" },
  { type: "disgust", emoji: "🤢", label: "Отвратительно" },
  { type: "love", emoji: "❤️", label: "Люблю" },
  { type: "surprise", emoji: "😮", label: "Удивительно" },
  { type: "sad", emoji: "😢", label: "Грустно" },
];

const reactionByType = new Map(reactionOptions.map((item) => [item.type, item]));

const composerEmojis = ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😍","😘","😎","🤓","🤔","🤗","🤭","😴","😢","😭","😡","🤢","🥳","😮","😱","🤩","😈","👍","👎","👏","🙏","💪","👋","❤️","💔","🔥","✨","🎉","🎁","🎵","💬","🌿","☀️","🌙","⭐","✅","❌","💯","🚀","🍀","🌈","☕","🍕","🎮","📷","💻","⚡","🎂","🥂","😺","🐶","🦊","🐼","🌸","🌺","🖤","🤍","💚","💙","💜","🤝","✌️","👌","😌","😏","🙄","😬","🤪","🤫"];

type ConversationProps = {
  currentUserId?: string; room: Room; dialog: string | null; dialogId: string | null; directConversations: DirectConversation[]; onOpenDirect: (person: Person) => void; onDismissDirect: (personId: string) => void; messages: Message[]; draft: string; muted: boolean;
  attachment: Attachment | null; replyingTo: Message | null; uploadingAttachment: boolean;
  canDelete: boolean; canReport: boolean; canReact: boolean; hasOlder: boolean; loadingOlder: boolean; notice: string;
  onDraftChange: (value: string) => void; onSend: FormEventHandler<HTMLFormElement>; onLoadOlder: () => void;
  onFileSelect: (file: File) => void; onRemoveAttachment: () => void;
  onDelete: (messageId: string) => void; onReply: (message: Message) => void; onCancelReply: () => void; onReport: (messageId: string, label: string) => void;
  onReact: (messageId: string, type: ReactionType) => Promise<void>; onExitDialog: () => void; onRevealMessage: (message: Message) => void; onNotice: (message: string) => void; mentionCandidates: Person[]; mentionFocusRequest: number;
};

function formatSize(size: number) {
  if (size < 1024) return size + " Б";
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " КБ";
  return (size / (1024 * 1024)).toFixed(1).replace(".0", "") + " МБ";
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return minutes + ":" + rest;
}

function attachmentMeta(attachment: Attachment) {
  const expires = attachment.expiresAt ? new Date(attachment.expiresAt) : null;
  const expiry = expires && !Number.isNaN(expires.getTime())
    ? "до " + expires.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "24 часа";
  return formatSize(attachment.size) + " · хранится " + expiry;
}

function AudioAttachment({ attachment, source }: { attachment: Attachment; source: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durationProbeRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const voice = attachment.mimeType === "audio/webm" || attachment.originalName.startsWith("voice");

  function syncDuration(audio: HTMLAudioElement) {
    const seekableDuration = audio.seekable.length > 0 ? audio.seekable.end(audio.seekable.length - 1) : 0;
    const nextDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seekableDuration;
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return false;
    setDuration(nextDuration);
    if (durationProbeRef.current) {
      durationProbeRef.current = false;
      audio.currentTime = 0;
      setPosition(0);
    }
    return true;
  }

  function detectDuration(audio: HTMLAudioElement) {
    if (syncDuration(audio) || durationProbeRef.current) return;
    durationProbeRef.current = true;
    try {
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      durationProbeRef.current = false;
    }
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { setPlaying(false); }
    } else {
      audio.pause();
    }
  }

  return <div className="attachment-card audio-attachment">
    <button type="button" className="audio-play" aria-label={playing ? "Поставить аудио на паузу" : "Воспроизвести аудио"} title={playing ? "Пауза" : "Воспроизвести"} onClick={() => void toggle()}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
    <span className="attachment-icon audio"><FileAudio size={19} /></span>
    <span className="attachment-copy">
      <strong>{voice ? "Голосовое сообщение" : attachment.originalName}</strong>
      <small>{formatDuration(position)} / {formatDuration(duration)} · {attachmentMeta(attachment)}</small>
      <input className="audio-progress" type="range" min="0" max={duration > 0 ? duration : 1} step="0.01" value={duration > 0 ? Math.min(position, duration) : 0} aria-label="Позиция воспроизведения" style={{ "--audio-progress": (duration > 0 ? Math.min(100, position / duration * 100) : 0) + "%" } as CSSProperties} onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setPosition(next); }} />
    </span>
    <audio ref={audioRef} preload="metadata" src={source} onLoadedMetadata={(event) => detectDuration(event.currentTarget)} onDurationChange={(event) => syncDuration(event.currentTarget)} onProgress={(event) => syncDuration(event.currentTarget)} onCanPlay={(event) => detectDuration(event.currentTarget)} onTimeUpdate={(event) => { if (syncDuration(event.currentTarget) && !durationProbeRef.current) setPosition(event.currentTarget.currentTime); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPosition(0); }} />
  </div>;
}

function AttachmentCard({ attachment, onOpenImage }: { attachment: Attachment; onOpenImage: (attachment: Attachment) => void }) {
  if (attachment.status === "rejected") return <span className="message-attachment rejected">Вложение отклонено</span>;
  if (attachment.status === "pending") return <span className="message-attachment pending"><LoaderCircle className="spin" size={13} />Вложение обрабатывается</span>;
  const source = API_URL + attachment.url;
  if (attachment.kind === "audio") return <AudioAttachment attachment={attachment} source={source} />;
  const preview = API_URL + (attachment.previewUrl ?? attachment.url);
  return <div className="image-attachment">
    <button type="button" className="attachment-card image-card" aria-label="Открыть изображение" title="Открыть изображение" onClick={() => onOpenImage(attachment)}>
      <img src={preview} alt="" />
      <span className="attachment-copy"><strong>Изображение</strong><small>{attachmentMeta(attachment)}</small></span>
    </button>
  </div>;
}

function RoomCover({ room, className = "" }: { room: Room; className?: string }) {
  const source = room.coverThumbnailUrl || room.coverUrl;
  return source ? <img className={"room-cover room-cover-image " + className} src={source} alt="" /> : <span className={"room-cover " + room.tone + " " + className} aria-hidden="true">{room.coverEmoji || "✦"}</span>;
}

function RoomInfoModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const createdAt = new Date(room.createdAt);
  const created = Number.isNaN(createdAt.getTime()) ? "Дата создания не указана" : createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const type = room.kind === "general" ? "Общая" : room.visibility === "private" ? "Приватная" : "Публичная";
  return <div className="modal-backdrop room-info-backdrop" onClick={onClose}>
    <section className="modal room-info-modal" role="dialog" aria-modal="true" aria-label={"О комнате " + room.name} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
      <span className="eyebrow">О КОМНАТЕ</span>
      <div className="room-info-title"><RoomCover room={room} /><div><h2># {room.name.toLowerCase()}</h2><small>{room.memberCount} участников</small></div></div>
      <dl className="room-info-list">
        <div><dt>Тип</dt><dd>{type}</dd></div>
        <div><dt>Доступ</dt><dd>{room.visibility === "private" ? "По приглашению" : "Открыта для участников"}</dd></div>
        <div><dt>Создана</dt><dd>{created}</dd></div>
      </dl>
      {room.description && <section className="room-info-section"><h3>Описание</h3><p>{room.description}</p></section>}
      {room.rules && <section className="room-info-section"><h3>Правила комнаты</h3><p>{room.rules}</p></section>}
    </section>
  </div>;
}

export function Conversation({ currentUserId, room, dialog, dialogId, directConversations, onOpenDirect, onDismissDirect, messages, draft, muted, attachment, replyingTo, uploadingAttachment, canDelete, canReport, canReact, hasOlder, loadingOlder, notice, onDraftChange, onSend, onLoadOlder, onFileSelect, onRemoveAttachment, onDelete, onReply, onCancelReply, onReport, onReact, onExitDialog, onRevealMessage, onNotice, mentionCandidates, mentionFocusRequest }: ConversationProps) {
  const [reactionMenu, setReactionMenu] = useState<string | null>(null);
  const [deleteHoldingId, setDeleteHoldingId] = useState<string | null>(null);
  const deleteHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceLevels, setVoiceLevels] = useState<number[]>(Array(14).fill(0));
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [imagePreview, setImagePreview] = useState<Attachment | null>(null);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionButtonAt, setMentionButtonAt] = useState<number | null>(null);
  const [frequentEmojis, setFrequentEmojis] = useState<string[]>([]);
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [contentTab, setContentTab] = useState<"chat" | "media" | "links">("chat");
  const [resources, setResources] = useState<RoomResources | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | number | null>(null);
  const mentionMatch = draft.match(/(?:^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionMatch?.[1].toLowerCase() ?? "";
  const mentionOptions = mentionMatch ? mentionCandidates.filter((person) =>
    person.name.toLowerCase().includes(mentionQuery) || person.username?.toLowerCase().includes(mentionQuery)
  ).slice(0, 5) : [];
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiToggleRef = useRef<HTMLButtonElement | null>(null);
  const draftPreviewRef = useRef<HTMLDivElement | null>(null);
  const draftPreviewToggleRef = useRef<HTMLButtonElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const isNearLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const canSend = !muted && !uploadingAttachment && Boolean(draft.trim() || attachment);
  const emojiStorageKey = "aura:frequent-emojis:" + (currentUserId ?? "guest");
  useEffect(() => { try { setFrequentEmojis(JSON.parse(localStorage.getItem(emojiStorageKey) ?? "[]").slice(0, 10)); } catch { setFrequentEmojis([]); } }, [emojiStorageKey]);
  function insertEmoji(emoji: string) { const field = composerInputRef.current; const start = field?.selectionStart ?? draft.length; const end = field?.selectionEnd ?? draft.length; onDraftChange(draft.slice(0, start) + emoji + draft.slice(end)); const next = [emoji, ...frequentEmojis.filter((item) => item !== emoji)].slice(0, 10); setFrequentEmojis(next); localStorage.setItem(emojiStorageKey, JSON.stringify(next)); setEmojiOpen(false); requestAnimationFrame(() => { composerInputRef.current?.focus(); composerInputRef.current?.setSelectionRange(start + emoji.length, start + emoji.length); }); }
  useEffect(() => { if (!mentionFocusRequest) return; requestAnimationFrame(() => { composerInputRef.current?.focus(); composerInputRef.current?.setSelectionRange(draft.length, draft.length); }); }, [mentionFocusRequest, draft.length]);

  function updateLatestPosition() {
    const list = messagesRef.current;
    if (!list) return;
    const nearLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 72;
    isNearLatestRef.current = nearLatest;
    setShowJumpToLatest(!nearLatest);
  }

  function jumpToLatest() {
    const list = messagesRef.current;
    if (!list) return;
    isNearLatestRef.current = true;
    setShowJumpToLatest(false);
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }

  function jumpToMessage(messageId: string | number, message?: Message) {
    setContentTab("chat");
    if (message) onRevealMessage(message);
    setHighlightedMessageId(messageId);
    window.setTimeout(() => document.getElementById("message-" + messageId)?.scrollIntoView({ block: "center", behavior: "smooth" }), 40);
    window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 1800);
  }

  async function revealRoomMessage(messageId: string) {
    try {
      const message = messages.find((item) => item.id === messageId) ?? await fetchRoomMessage(room.id, messageId);
      jumpToMessage(messageId, message);
    } catch {
      onNotice("Исходное сообщение больше недоступно.");
    }
  }

  function cancelDeleteHold() {
    if (deleteHoldTimer.current) clearTimeout(deleteHoldTimer.current);
    deleteHoldTimer.current = null;
    setDeleteHoldingId(null);
  }

  function startDeleteHold(messageId: string) {
    cancelDeleteHold();
    setDeleteHoldingId(messageId);
    deleteHoldTimer.current = setTimeout(() => {
      deleteHoldTimer.current = null;
      setDeleteHoldingId(null);
      onDelete(messageId);
    }, 2000);
  }

  useEffect(() => () => {
    if (deleteHoldTimer.current) clearTimeout(deleteHoldTimer.current);
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const focusComposer = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      if (!muted) composerInputRef.current?.focus();
    };
    window.addEventListener("keydown", focusComposer);
    return () => window.removeEventListener("keydown", focusComposer);
  }, [muted]);

  useEffect(() => {
    if (contentTab === "chat") return;
    let active = true;
    setResourcesLoading(true);
    const request = dialog ? fetchDirectResources() : fetchRoomResources(room.id);
    request.then((value) => { if (active) setResources(value); }).catch(() => { if (active) onNotice(dialog ? "Не удалось загрузить материалы личных сообщений." : "Не удалось загрузить материалы комнаты."); }).finally(() => { if (active) setResourcesLoading(false); });
    return () => { active = false; };
  }, [contentTab, dialog, room.id]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchOpen || !query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setSearchLoading(true);
      const request = dialogId ? searchDirectMessages(dialogId, query) : searchRoomMessages(room.id, query);
      request.then((items) => { if (active) setSearchResults(items); })
        .catch(() => { if (active) setSearchResults([]); })
        .finally(() => { if (active) setSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [dialogId, room.id, searchOpen, searchQuery]);

  useEffect(() => {
    isNearLatestRef.current = true;
    setShowJumpToLatest(false);
  }, [room.id, dialogId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const list = messagesRef.current;
      if (list && isNearLatestRef.current) {
        list.scrollTop = list.scrollHeight;
        setShowJumpToLatest(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [room.id, dialogId, messages[messages.length - 1]?.id]);

  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(Math.max(input.scrollHeight, 48), 88) + "px";
  }, [draft]);

  useEffect(() => {
    if (!emojiOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setEmojiOpen(false); };
    const closeOnOutsideClick = (event: PointerEvent) => { const target = event.target; if (target instanceof Node && !emojiPickerRef.current?.contains(target) && !emojiToggleRef.current?.contains(target)) setEmojiOpen(false); };
    window.addEventListener("keydown", closeOnEscape); window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("pointerdown", closeOnOutsideClick); };
  }, [emojiOpen]);

  useEffect(() => {
    if (!draftPreviewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDraftPreviewOpen(false); };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !draftPreviewRef.current?.contains(target) && !draftPreviewToggleRef.current?.contains(target)) setDraftPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => { window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("pointerdown", closeOnOutsideClick); };
  }, [draftPreviewOpen]);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);

  function stopVoiceMeter() { if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); meterFrameRef.current = null; recordingTimerRef.current = null; void meterContextRef.current?.close(); meterContextRef.current = null; setVoiceLevels(Array(14).fill(0)); }
  function startVoiceMeter(stream: MediaStream) { const context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 64; context.createMediaStreamSource(stream).connect(analyser); meterContextRef.current = context; const data = new Uint8Array(analyser.frequencyBinCount); const tick = () => { analyser.getByteTimeDomainData(data); const level = data.reduce((sum, value) => sum + Math.abs(value - 128), 0) / data.length / 128; setVoiceLevels(Array.from({ length: 14 }, (_, index) => Math.min(1, level * (12 + (index % 5) * 1.8)))); meterFrameRef.current = requestAnimationFrame(tick); }; tick(); setRecordingSeconds(0); recordingTimerRef.current = setInterval(() => setRecordingSeconds((value) => value + 1), 1000); }

  async function toggleVoiceRecording() {
    if (recordingVoice) {
      recorderRef.current?.stop();
      setRecordingVoice(false);
      onNotice("Голосовое записано и загружается…");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceChunksRef.current = [];
      recorderRef.current = recorder;
      recordingStreamRef.current = stream;
      startVoiceMeter(stream);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) voiceChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        stopVoiceMeter();
        const type = (recorder.mimeType || "audio/webm").split(";")[0];
        const extension = type === "audio/ogg" ? ".ogg" : ".webm";
        const blob = new Blob(voiceChunksRef.current, { type });
        voiceChunksRef.current = [];
        if (blob.size > 0) onFileSelect(new File([blob], "voice" + extension, { type }));
      };
      recorder.start(250);
      setRecordingVoice(true);
      onNotice("Идёт запись голосового сообщения…");
    } catch {
      onNotice("Не удалось получить доступ к микрофону.");
    }
  }

  async function react(messageId: string, type: ReactionType) {
    setReactionMenu(null);
    await onReact(messageId, type);
  }

  function mentionAuthor(name: string) { const person = mentionCandidates.find((item) => item.name === name); const handle = person?.username ?? person?.name ?? name; onDraftChange(draft + (draft && !draft.endsWith(" ") ? " " : "") + "@" + handle + ": "); requestAnimationFrame(() => { composerInputRef.current?.focus(); composerInputRef.current?.setSelectionRange((draft + (draft && !draft.endsWith(" ") ? " " : "") + "@" + handle + ": ").length, (draft + (draft && !draft.endsWith(" ") ? " " : "") + "@" + handle + ": ").length); }); }

  return <section className="conversation">
    <div className={"conversation-head " + (dialog ? "dialog-head" : "room-head")}>
      {dialog ? <>
        <div><span className="eyebrow">ЛИЧНЫЙ ДИАЛОГ</span><h2>{dialog}</h2></div>
        <div className="head-actions"><button type="button" className="dialog-return" aria-label="Вернуться в общий чат" title="Вернуться в общий чат" onClick={onExitDialog}><ArrowLeft size={17} /></button><button aria-label="Поиск сообщений" title="Поиск сообщений" onClick={() => { setSearchOpen(true); setSearchQuery(""); }}><Search size={17} /></button></div>
      </> : <>
        <div className="room-heading">
          <RoomCover room={room} />
          <div className="room-heading-copy">
            <span className="eyebrow">{room.kind === "general" ? "ОБЩАЯ КОМНАТА" : room.visibility === "private" ? "ПРИВАТНАЯ КОМНАТА" : "ПУБЛИЧНАЯ КОМНАТА"}</span>
            <h2># {room.name.toLowerCase()}</h2>
          </div>
        </div>
        <div className="room-head-actions">
          <span className="room-member-count" title="Сейчас в чате"><Users size={15} />{room.online} онлайн</span>
          <div className="head-actions"><button aria-label="Поиск сообщений" title="Поиск сообщений" onClick={() => { setSearchOpen(true); setSearchQuery(""); }}><Search size={17} /></button><button aria-label="О комнате" title="О комнате" onClick={() => setRoomInfoOpen(true)}><Ellipsis size={18} /></button></div>
        </div>
      </>}
    </div>
    {dialog && <nav className="direct-tags" aria-label="Личные диалоги">{directConversations.map((conversation) => <span className={"direct-tag " + (conversation.peer.id === dialogId ? "active" : "")} key={conversation.peer.id}><button type="button" onClick={() => onOpenDirect(conversation.peer)}>{conversation.peer.name}{conversation.unread > 0 && <b>{conversation.unread > 99 ? "99+" : conversation.unread}</b>}</button><button type="button" className="direct-tag-close" aria-label={"Скрыть диалог с " + conversation.peer.name} title="Скрыть из списка" onClick={() => conversation.peer.id && onDismissDirect(conversation.peer.id)}><X size={13} /></button></span>)}</nav>}
    {searchOpen && <div className="message-search-backdrop" onMouseDown={() => setSearchOpen(false)}><section className="message-search" onMouseDown={(event) => event.stopPropagation()}><div><strong>Поиск по всей истории</strong><button type="button" onClick={() => setSearchOpen(false)} aria-label="Закрыть поиск"><X size={16} /></button></div><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Текст или имя автора" />{searchLoading ? <p className="message-search-state">Поиск…</p> : searchQuery.trim() && (searchResults.length ? <ul>{searchResults.map((message) => <li key={message.id}><button type="button" onClick={() => { setSearchOpen(false); jumpToMessage(message.id, message); }}><strong>{message.author}</strong><small>{message.time} · {message.body || "Вложение"}</small></button></li>)}</ul> : <p className="message-search-state">Ничего не найдено.</p>)}</section></div>}
    <nav className="room-tabs" aria-label="Содержимое комнаты">{([["chat","Чат"],["media","Медиа"],["links","Ссылки"]] as const).map(([tab,label]) => <button type="button" key={tab} className={contentTab === tab ? "active" : ""} onClick={() => setContentTab(tab)}>{label}</button>)}</nav>
    <div ref={messagesRef} className={"messages " + (contentTab === "chat" ? "" : "tab-hidden")} onScroll={updateLatestPosition} onClick={(event) => { if (event.target === event.currentTarget) setReactionMenu(null); }}>
      {hasOlder && <button className="load-older" disabled={loadingOlder} onClick={onLoadOlder}>{loadingOlder ? "Загрузка…" : "Показать более ранние"}</button>}
      {messages.map((message) => message.system
        ? <div className="system-message" key={message.id}>{message.body}</div>
        : <article id={"message-" + message.id} className={"message " + (message.mine ? "mine " : "") + (message.replyTo?.authorId === currentUserId ? "reply-for-current-user " : "") + (highlightedMessageId === message.id ? "message-highlighted" : "")} key={message.id}>
          <Avatar value={message.avatarUrl} name={message.author} className="message-avatar" />
          <div className="message-content">
            <div className="message-heading">{!dialog && !message.mine ? <button type="button" className="message-author-mention" title="Упомянуть в сообщении" onClick={() => mentionAuthor(message.author)}>{message.author}</button> : <strong>{message.author}</strong>}<time>{message.time}</time><span className="message-heading-reactions">{(message.reactions ?? []).map((reaction) => {
                const option = reactionByType.get(reaction.type);
                return option ? <button type="button" className={"reaction-pill " + (reaction.mine ? "mine" : "")} key={reaction.type} title={option.label} aria-label={option.label + ": " + reaction.count} onClick={() => typeof message.id === "string" && void react(message.id, reaction.type)}><span>{option.emoji}</span><b>{reaction.count}</b></button> : null;
              })}</span></div>
            {(message.replyTo || message.body) && <div className="message-copy" title={message.body}>
              {message.replyTo && <button type="button" className="inline-reply" title={"Перейти к сообщению " + message.replyTo.author + " в " + message.replyTo.time} onClick={() => jumpToMessage(message.replyTo!.id)}><Reply size={10} /><b>{message.replyTo.author}</b><time>{message.replyTo.time}</time></button>}
              {message.body && <span className="message-body">{message.body.replace(/^(@[\wа-яё-]+):\s*→\s*/i, "$1 → ").split(/(@[\wа-яё-]+)/gi).map((part, index) => part.startsWith("@") ? <mark className="mention" key={index}>{part}</mark> : part)}</span>}
            </div>}
            <div className="message-extras">
              {(message.attachments ?? []).map((item) => <AttachmentCard key={item.id} attachment={item} onOpenImage={setImagePreview} />)}
            </div>
          </div>
          <div className="message-actions">
            {typeof message.id === "string" && <button type="button" className="reply-toggle" aria-label="Ответить на сообщение" title="Ответить на сообщение" onClick={() => onReply(message)}><Reply size={14} /></button>}
            {canReact && typeof message.id === "string" && <button type="button" className="reaction-toggle" data-testid={"reaction-toggle-" + message.id} aria-label="Оценить сообщение" title="Оценить сообщение" aria-expanded={reactionMenu === message.id} onClick={() => setReactionMenu((current) => current === message.id ? null : message.id as string)}><SmilePlus size={14} /></button>}
            {reactionMenu === message.id && <div className="reaction-picker" data-testid={"reaction-picker-" + message.id} role="menu" aria-label="Реакции на сообщение">{reactionOptions.map((option) => <button type="button" role="menuitem" key={option.type} className={(message.reactions ?? []).some((reaction) => reaction.type === option.type && reaction.mine) ? "selected" : ""} aria-label={option.label} title={option.label} onClick={() => void react(message.id as string, option.type)}><span>{option.emoji}</span><small>{option.label}</small></button>)}</div>}
            {canReport && !message.mine && typeof message.id === "string" && <button type="button" className="report-message" aria-label="Пожаловаться" title="Пожаловаться" onClick={() => onReport(message.id as string, "Сообщение от " + message.author)}><Flag size={13} /></button>}
            {canDelete && !dialog && typeof message.id === "string" && <button type="button" className={"delete-message " + (deleteHoldingId === message.id ? "holding" : "")} aria-label="Удалить сообщение: удерживайте две секунды" title="Удерживайте две секунды для удаления" onClick={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => { event.preventDefault(); startDeleteHold(message.id as string); }} onPointerUp={cancelDeleteHold} onPointerLeave={cancelDeleteHold} onPointerCancel={cancelDeleteHold} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) startDeleteHold(message.id as string); }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") cancelDeleteHold(); }}><Trash2 size={14} /></button>}
          </div>
        </article>)}
    </div>
    {showJumpToLatest && contentTab === "chat" && <button type="button" className="jump-to-latest" onClick={jumpToLatest}><span>К новым сообщениям</span><ChevronDown size={16} /></button>}
    {contentTab !== "chat" && <section className={"room-resource-panel " + (dialog ? "direct-resources" : "")}>{resourcesLoading ? <p>Загрузка…</p> : contentTab === "links" ? (resources?.links.length ? resources.links.map((item) => <article key={item.messageId + item.url}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.author}</strong><span>{item.url}</span></a><button type="button" className="resource-jump" onClick={() => void revealRoomMessage(item.messageId)}>К сообщению</button></article>) : <p>{dialog ? "В личных сообщениях ссылок пока нет." : "Ссылок в этой комнате пока нет."}</p>) : (resources?.media?.length ? resources?.media?.map((item) => <article key={item.messageId + item.attachment.id}><AttachmentCard attachment={item.attachment} onOpenImage={setImagePreview} /><footer><small>{item.author} · {new Date(item.createdAt).toLocaleString("ru-RU")}</small><button type="button" className="resource-jump" onClick={() => void revealRoomMessage(item.messageId)}>К сообщению</button></footer></article>) : <p>{dialog ? "В личных сообщениях медиа пока нет." : "Медиа в этой комнате пока нет."}</p>)}</section>}
    {replyingTo && <div className="composer-reply"><Reply size={13} /><span>Ответ для <b>{replyingTo.author}</b> в {replyingTo.time}</span><button type="button" aria-label="Отменить ответ" title="Отменить ответ" onClick={onCancelReply}><X size={14} /></button></div>}
    {attachment && <div className="composer-file"><span>{attachment.kind === "image" ? <FileImage size={15} /> : <FileAudio size={15} />}{attachment.originalName}<small>готово к отправке · хранится 24 часа</small></span><button type="button" aria-label="Убрать вложение" onClick={onRemoveAttachment}><X size={15} /></button></div>}
    <form className="composer" onSubmit={onSend}>
      <label className={"attach " + (uploadingAttachment ? "busy" : "")} aria-label="Прикрепить изображение или аудио" title="Прикрепить изображение или аудио">
        {uploadingAttachment ? <LoaderCircle className="spin" size={19} /> : <Paperclip size={19} />}
        <input type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/webm" disabled={muted || uploadingAttachment} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFileSelect(file); event.target.value = ""; }} />
      </label>
<button className={"voice-record " + (recordingVoice ? "recording" : "")} type="button" aria-label={recordingVoice ? "Остановить запись" : "Записать голосовое"} title={recordingVoice ? "Остановить запись" : "Записать голосовое"} disabled={muted || uploadingAttachment} onClick={() => void toggleVoiceRecording()}>{recordingVoice ? <Square size={15} /> : <Mic size={18} />}</button>{recordingVoice && <div className="voice-meter" aria-label="Идёт запись"><b>● {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</b><span>{voiceLevels.map((level, index) => <i key={index} style={{ height: (6 + level * 22) + "px" }} />)}</span></div>}
      <button ref={emojiToggleRef} className={"emoji-toggle " + (emojiOpen ? "active" : "")} type="button" aria-label="Открыть смайлы" title="Смайлы" aria-expanded={emojiOpen} disabled={muted} onClick={() => setEmojiOpen((open) => !open)}><Smile size={18} /></button><button className="mention-toggle" type="button" aria-label="Упомянуть участника" title="Упомянуть участника" disabled={muted} onClick={() => { const field = composerInputRef.current; if (mentionButtonAt !== null && draft[mentionButtonAt] === "@") { onDraftChange(draft.slice(0, mentionButtonAt) + draft.slice(mentionButtonAt + 1)); setMentionButtonAt(null); requestAnimationFrame(() => { composerInputRef.current?.focus(); composerInputRef.current?.setSelectionRange(mentionButtonAt, mentionButtonAt); }); return; } const start = field?.selectionStart ?? draft.length; const end = field?.selectionEnd ?? draft.length; onDraftChange(draft.slice(0, start) + "@" + draft.slice(end)); setMentionButtonAt(start); requestAnimationFrame(() => { composerInputRef.current?.focus(); composerInputRef.current?.setSelectionRange(start + 1, start + 1); }); }}><AtSign size={17} /></button>
      {emojiOpen && <div ref={emojiPickerRef} className="composer-emoji-picker" role="dialog" aria-label="Выбор смайла">{frequentEmojis.length > 0 && <><strong>Частые</strong><div className="emoji-grid frequent">{frequentEmojis.map((emoji) => <button key={emoji} type="button" aria-label={"Вставить " + emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div></>}<strong>Все смайлы</strong><div className="emoji-grid">{composerEmojis.map((emoji) => <button key={emoji} type="button" aria-label={"Вставить " + emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div></div>}
      {mentionOptions.length > 0 && <div className="mention-picker" role="listbox">{mentionOptions.map((person) => <button type="button" role="option" key={person.id ?? person.name} onClick={() => { onDraftChange(draft.replace(/@[^\s@]*$/, "@" + (person.username ?? person.name) + ": ")); composerInputRef.current?.focus(); }}><Avatar value={person.avatar} name={person.name} className="small" /><span>{person.name}{person.username && <small>{" @" + person.username}</small>}</span></button>)}</div>}
      <textarea ref={composerInputRef} value={draft} onChange={(event) => { setMentionButtonAt(null); onDraftChange(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={1000} rows={2} disabled={muted} title="Ctrl + Alt + M — перейти к полю сообщения" placeholder={muted ? "Вы временно не можете писать" : "Написать в " + (dialog ? "личку" : "#" + room.name.toLowerCase()) + "…"} />
      <button ref={draftPreviewToggleRef} className="composer-expand" type="button" aria-label={draftPreviewOpen ? "Закрыть полный текст сообщения" : "Открыть полный текст сообщения"} title={draftPreviewOpen ? "Закрыть полный текст" : "Открыть полный текст"} aria-expanded={draftPreviewOpen} disabled={muted} onClick={() => setDraftPreviewOpen((open) => !open)}><Maximize2 size={15} /></button><button className="composer-clear" type="button" aria-label="Очистить текст сообщения" title="Очистить текст" disabled={muted || !draft} onClick={() => onDraftChange("")}><X size={15} /></button>
      {draftPreviewOpen && <div ref={draftPreviewRef} className="composer-draft-preview" role="dialog" aria-label="Полный текст сообщения"><div><strong>Сообщение целиком</strong><button type="button" aria-label="Закрыть" title="Закрыть" onClick={() => setDraftPreviewOpen(false)}><X size={15} /></button></div><textarea autoFocus rows={8} value={draft} maxLength={1000} disabled={muted} onChange={(event) => onDraftChange(event.target.value)} placeholder="Написать сообщение…" /></div>}
      <button className="send" type="submit" aria-label="Отправить сообщение" title="Отправить сообщение" disabled={!canSend}><Send size={16} /></button>
    </form>

    {roomInfoOpen && <RoomInfoModal room={room} onClose={() => setRoomInfoOpen(false)} />}
    {imagePreview && typeof document !== "undefined" && createPortal(
      <div className="image-viewer-backdrop" role="presentation" onMouseDown={() => setImagePreview(null)}>
        <section className="image-viewer" role="dialog" aria-modal="true" aria-label={"Просмотр изображения " + imagePreview.originalName} onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" className="image-viewer-close" aria-label="Закрыть изображение" title="Закрыть" onClick={() => setImagePreview(null)}><X size={19} /></button>
          <img src={API_URL + imagePreview.url} alt={"Вложение: " + imagePreview.originalName} />
        </section>
      </div>,
      document.body,
    )}
  </section>;
}

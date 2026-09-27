"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AtSign, Ellipsis, FileAudio, FileImage, Hash, Image, Maximize2, Link2, LoaderCircle, Mic, Paperclip, Plus, Send, Smile, Square, X } from "lucide-react";
import type { Attachment, AuthUser, CosmeticAppearance, Community, CommunityMember, CommunityMessage, CommunityTopic, Person, Room } from "@/lib/chat-contract";
import { API_URL } from "@/lib/chat-api";
import { createCommunityTopic, fetchCommunity, fetchCommunityChat, fetchCommunityChatPage, fetchCommunityTopics, sendCommunityChatMessage, uploadAttachment } from "@/lib/social-api";
import { Avatar } from "./avatar";
import { messagePreviewStyle } from "@/lib/message-preview-size";
import { StyledMessageText, StyledName } from "./cosmetics";
import { PeoplePanel } from "./people-panel";
import { BackToChatButton } from "./back-to-chat-button";
import { ComposerAppearanceMenu, ComposerMessageColorPicker, ComposerTextStyleToggles } from "./appearance-settings";

const emojis = ["😀", "😂", "😍", "👍", "❤️", "🔥", "🎉", "👏", "🤝", "💚", "✨", "👋", "🤔", "😎", "🥳", "💬", "📷", "🎵", "🌿", "☀️"];

function messageLinks(message: CommunityMessage) {
  return message.body.match(/https?:\/\/[^\s<]+/g) ?? [];
}

function CommunityAttachment({ attachment }: { attachment: Attachment }) {
  const source = API_URL + attachment.url;
  if (attachment.kind === "audio") return <audio className="community-audio" controls src={source}>Аудио-вложение</audio>;
  return <a className="community-image" href={source} target="_blank" rel="noreferrer"><img src={API_URL + (attachment.previewUrl ?? attachment.url)} alt={attachment.originalName} /></a>;
}

type CommunityChatPageProps = {
  community: Community; user: AuthUser; rooms: Room[]; roomId: string; mutedPeople: Set<string>;
  onOpenProfile: (person: Person) => void; onOpenPrivate: (person: Person) => void;
  onModerate: (person: Person) => void; onReport: (person: Person) => void;
  onChangeRoom: (roomId: string) => void; onBackToChat: () => void; onOpenRooms: () => void;
  onToggleMute: (person: Person, muted: boolean) => void; onAppearanceChanged: (appearance: CosmeticAppearance) => void;
};

export function CommunityChatPage({ community, user, rooms, roomId, mutedPeople, onOpenProfile, onOpenPrivate, onModerate, onReport, onChangeRoom, onBackToChat, onOpenRooms, onToggleMute, onAppearanceChanged }: CommunityChatPageProps) {
  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "media" | "links">("chat");
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [historyMode, setHistoryMode] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [resourceMessages, setResourceMessages] = useState<CommunityMessage[]>([]);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [draftPreviewOpen, setDraftPreviewOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const contentMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (attachment) inputRef.current?.focus({ preventScroll: true });
  }, [attachment]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canManage = user.role === "admin" || community.membership?.role === "owner" || community.membership?.role === "moderator";

  useEffect(() => {
    if (!contentMenuOpen) return;
    const closeMenu = (event: MouseEvent) => { if (!contentMenuRef.current?.contains(event.target as Node)) setContentMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setContentMenuOpen(false); };
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("mousedown", closeMenu); window.removeEventListener("keydown", closeOnEscape); };
  }, [contentMenuOpen]);

  useEffect(() => {
    const loadMembers = () => void fetchCommunity(community.id).then((detail) => setMembers(detail.members)).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить участников"));
    loadMembers();
    const timer = window.setInterval(loadMembers, 5000);
    return () => window.clearInterval(timer);
  }, [community.id]);

  useEffect(() => {
    if (activeTab !== "chat" || historyMode) return;
    let active = true;
    const load = async () => {
      try {
        const [nextTopics, page] = await Promise.all([fetchCommunityTopics(community.id), fetchCommunityChatPage(community.id, activeTopic ?? undefined)]);
        if (!active) return;
        setTopics(nextTopics); setMessages(page.items); setOlderCursor(page.nextCursor); setError("");
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить чат сообщества"); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [community.id, activeTopic, activeTab, historyMode]);

  useEffect(() => {
    if (activeTab === "chat") return;
    void fetchCommunityChat(community.id).then(setResourceMessages).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить материалы"));
  }, [activeTab, community.id]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function loadOlderMessages() {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchCommunityChatPage(community.id, activeTopic ?? undefined, olderCursor);
      setMessages((old) => [...page.items, ...old].slice(0, 150));
      setOlderCursor(page.nextCursor);
      setHistoryMode(true);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить старые сообщения"); }
    finally { setLoadingOlder(false); }
  }

  async function createTopic(event: FormEvent) {
    event.preventDefault(); const name = newTopic.trim(); if (!name) return;
    try { const topic = await createCommunityTopic(community.id, name); setTopics((old) => [...old, topic]); setNewTopic(""); setAddingTopic(false); setHistoryMode(false); setActiveTopic(topic.id); setActiveTab("chat"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать тему"); }
  }

  async function selectFile(file?: File) {
    if (!file) return;
    setUploading(true); setError("");
    try { setAttachment(await uploadAttachment(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить вложение"); }
    finally { setUploading(false); }
  }

  async function toggleRecording() {
    if (recording) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined);
      const chunks: BlobPart[] = [];
      streamRef.current = stream; recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; recorderRef.current = null; setRecording(false);
        if (chunks.length) void selectFile(new File([new Blob(chunks, { type: recorder.mimeType || "audio/webm" })], "voice-message.webm", { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start(); setRecording(true);
    } catch { setError("Не удалось получить доступ к микрофону"); }
  }

  function insertEmoji(emoji: string) {
    const field = inputRef.current; const start = field?.selectionStart ?? body.length; const end = field?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + emoji + body.slice(end)); setEmojiOpen(false);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }

  function mention(member: { displayName: string }) {
    const text = "@" + member.displayName + ": ";
    const field = inputRef.current; const start = field?.selectionStart ?? body.length; const end = field?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end)); setMentionOpen(false);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(start + text.length, start + text.length); });
  }

  async function send(event: FormEvent) {
    event.preventDefault(); const value = body.trim(); if (!value && !attachment) return;
    try {
      const message = await sendCommunityChatMessage(community.id, value, activeTopic ?? undefined, attachment?.id);
      setMessages((old) => [...old, message].slice(-150)); if (historyMode) setHistoryMode(false); setBody(""); setAttachment(null); setEmojiOpen(false); setMentionOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отправить сообщение"); }
  }

  const media = resourceMessages.filter((message) => message.attachment);
  const links = resourceMessages.flatMap((message) => messageLinks(message).map((url) => ({ message, url })));
  const chatPeople: Person[] = members.filter((member) => member.status !== "offline").map((member) => ({
    id: member.id, username: member.username, name: member.displayName, status: member.status, gender: member.gender,
    role: member.siteRole === "admin" ? "admin" : member.siteRole === "moderator" || member.role === "moderator" || member.role === "owner" ? "moderator" : undefined,
    isBot: member.isBot, room: roomId, avatar: member.avatarThumbnailUrl ?? member.avatarUrl ?? member.displayName[0] ?? "?", avatarThumbnail: member.avatarUrl ?? undefined,
    appearance: member.id === user.id ? user.appearance : member.appearance,
  }));
  return <section className="community-chat-page">
    <header className="conversation-head room-head community-chat-room-head">
      <div className="room-heading"><span className="room-cover lime"><Hash size={16}/></span><div className="room-heading-copy"><span className="eyebrow">ЧАТ СООБЩЕСТВА</span><h2># {community.name.toLowerCase()}</h2></div></div>
      <div className="room-head-actions"><span className="room-member-count">В чате: {chatPeople.length}</span><div className="head-actions"><div className="content-menu" ref={contentMenuRef}><button type="button" aria-label="Разделы сообщества" title="Разделы сообщества" aria-expanded={contentMenuOpen} onClick={() => setContentMenuOpen((open) => !open)}><Ellipsis size={18} /></button>{contentMenuOpen && <div className="content-menu-popover" role="menu" aria-label="Разделы сообщества">{(["chat", "media", "links"] as const).map((tab) => <button type="button" role="menuitemradio" aria-checked={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => { setActiveTab(tab); setContentMenuOpen(false); }}>{tab === "chat" ? "Чат" : tab === "media" ? "Медиа" : "Ссылки"}</button>)}</div>}</div></div><BackToChatButton onClick={onBackToChat} /></div>
    </header>
    <main className="community-chat-main">
      {activeTab === "chat" && <>
        <div className="direct-tags community-topic-tags">
          <span className={"direct-tag " + (!activeTopic ? "active" : "")}><button type="button" onClick={() => { setHistoryMode(false); setActiveTopic(null); }}>Все темы</button></span>
          {topics.map((topic) => <span key={topic.id} className={"direct-tag " + (activeTopic === topic.id ? "active" : "")}><button type="button" onClick={() => { setHistoryMode(false); setActiveTopic(topic.id); }}><Hash size={12}/>{topic.name}</button></span>)}
          {canManage && <span className="direct-tag community-topic-add"><button type="button" onClick={() => setAddingTopic((value) => !value)}><Plus size={14}/>Тема</button></span>}
        </div>
        {addingTopic && <form className="community-topic-create" onSubmit={createTopic}>
          <div className="community-topic-create-head"><div><strong>Новая тема</strong><small>Название будет видно всем участникам сообщества</small></div><button className="community-topic-create-close" type="button" aria-label="Закрыть создание темы" title="Закрыть" onClick={() => { setAddingTopic(false); setNewTopic(""); }}><X size={15}/></button></div>
          <div className="community-topic-create-fields"><input autoFocus maxLength={60} value={newTopic} onChange={(event) => setNewTopic(event.target.value)} placeholder="Название темы"/><button type="submit">Создать</button></div>
        </form>}
        {olderCursor && <button type="button" className="load-older community-history-button" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>{loadingOlder ? "Загрузка…" : "Показать более ранние"}</button>}
        <div className="community-chat-page-messages">
          {messages.length === 0 ? <div className="notification-empty"><span><Hash size={28}/></span><strong>В этой теме пока тихо</strong><p>Начните обсуждение — его увидят только участники сообщества.</p></div> : messages.map((message) => <article className={"message " + (message.author.id === user.id ? "mine" : "")} key={message.id}><Avatar value={message.author.avatarUrl} name={message.author.displayName}/><div><div className="message-meta"><strong><StyledName name={message.author.displayName} appearance={message.author.appearance} avatarUrl={message.author.avatarUrl} /></strong><time>{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></div>{message.topic && <small className="community-message-topic">#{message.topic.name}</small>}{message.body && <p><StyledMessageText appearance={message.author.appearance}>{message.body}</StyledMessageText></p>}{message.attachment && <CommunityAttachment attachment={message.attachment} />}</div></article>)}
        </div>
        {historyMode && <button type="button" className="load-older community-history-button" onClick={() => setHistoryMode(false)}>Вернуться к новым сообщениям</button>}
        {attachment && <div className="composer-file community-composer-file"><span>{attachment.kind === "image" ? <FileImage size={15} /> : <FileAudio size={15} />}{attachment.originalName}<small>готово к отправке · хранится 24 часа</small></span><button type="button" aria-label="Убрать вложение" onClick={() => setAttachment(null)}><X size={15} /></button></div>}
        <form className="composer community-chat-page-composer" onSubmit={send}>
          <div className="composer-file-tools">
            <label className={"attach " + (uploading ? "busy" : "")} aria-label="Прикрепить изображение или аудио" title="Прикрепить изображение или аудио">{uploading ? <LoaderCircle className="spin" size={19} /> : <Paperclip size={19} />}<input type="file" accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav,audio/webm" disabled={uploading} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            <ComposerAppearanceMenu appearance={user.appearance} onSaved={onAppearanceChanged} />
            <ComposerMessageColorPicker appearance={user.appearance} onSaved={onAppearanceChanged} />
            <ComposerTextStyleToggles appearance={user.appearance} onSaved={onAppearanceChanged} />
          </div>
          <button className={"voice-record " + (recording ? "recording" : "")} type="button" aria-label={recording ? "Остановить запись" : "Записать голосовое"} title={recording ? "Остановить запись" : "Записать голосовое"} disabled={uploading} onClick={() => void toggleRecording()}>{recording ? <Square size={15} /> : <Mic size={18} />}</button>
          <button className={"emoji-toggle " + (emojiOpen ? "active" : "")} type="button" aria-label="Открыть смайлы" title="Смайлы" aria-expanded={emojiOpen} onClick={() => { setEmojiOpen((open) => !open); setMentionOpen(false); }}><Smile size={18} /></button>
          <button className={"mention-toggle " + (mentionOpen ? "active" : "")} type="button" aria-label="Упомянуть участника" title="Упомянуть участника" onClick={() => { setMentionOpen((open) => !open); setEmojiOpen(false); }}><AtSign size={17} /></button>
          {emojiOpen && <div className="composer-emoji-picker community-emoji-picker" role="dialog" aria-label="Выбор смайла"><strong>Смайлы</strong><div className="emoji-grid">{emojis.map((emoji) => <button key={emoji} type="button" aria-label={"Вставить " + emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div></div>}
          {mentionOpen && <div className="mention-picker community-mention-picker" role="listbox">{members.filter((member) => member.id !== user.id).map((member) => <button type="button" role="option" key={member.id} onClick={() => mention(member)}><Avatar value={member.avatarUrl} name={member.displayName} className="small" /><span>{member.displayName}<small>{member.role === "owner" ? "владелец" : member.role === "moderator" ? "модератор" : "участник"}</small></span></button>)}</div>}
          <textarea ref={inputRef} value={body} maxLength={2000} rows={2} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={activeTopic ? "Сообщение в выбранную тему…" : "Написать участникам…"} />
          <button className="composer-expand" type="button" aria-label={draftPreviewOpen ? "Закрыть полный текст сообщения" : "Открыть полный текст сообщения"} title={draftPreviewOpen ? "Закрыть полный текст" : "Открыть полный текст"} aria-expanded={draftPreviewOpen} onClick={() => setDraftPreviewOpen((open) => !open)}><Maximize2 size={15}/></button>
          <button className="composer-clear" type="button" aria-label="Очистить текст сообщения" title="Очистить текст" disabled={!body} onClick={() => setBody("")}><X size={15}/></button>
          {draftPreviewOpen && <div className="composer-draft-preview" style={messagePreviewStyle(body)} role="dialog" aria-label="Полный текст сообщения"><div><strong>Сообщение целиком</strong><button type="button" aria-label="Закрыть" title="Закрыть" onClick={() => setDraftPreviewOpen(false)}><X size={15}/></button></div><textarea autoFocus rows={8} value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Написать сообщение…" /></div>}
          <button className="send" type="submit" aria-label="Отправить сообщение" title="Отправить сообщение" disabled={uploading || (!body.trim() && !attachment)}><Send size={16}/></button>
        </form>
      </>}
      {activeTab === "media" && <section className="room-resource-panel community-resources">{media.length ? media.map((message) => <article key={message.id}><CommunityAttachment attachment={message.attachment!} /><footer><small>{message.author.displayName} · {new Date(message.createdAt).toLocaleString("ru-RU")}</small></footer></article>) : <p>Медиа в этом чате пока нет.</p>}</section>}
      {activeTab === "links" && <section className="room-resource-panel community-resources">{links.length ? links.map(({ message, url }) => <article key={message.id + url}><a href={url} target="_blank" rel="noreferrer"><strong>{message.author.displayName}</strong><span>{url}</span></a><footer><small>{new Date(message.createdAt).toLocaleString("ru-RU")}</small></footer></article>) : <p>Ссылок в этом чате пока нет.</p>}</section>}
    </main>
    <PeoplePanel className="community-chat-people-panel" people={chatPeople} rooms={rooms} roomId={roomId} currentUserId={user.id} canModerate={user.role === "admin" || user.role === "moderator"} privateMessagePreview={null} onOpenDialog={onOpenProfile} onMention={(person) => mention({ displayName: person.name })} onOpenPrivate={onOpenPrivate} onModerate={onModerate} onReport={onReport} onChangeRoom={onChangeRoom} onOpenRooms={onOpenRooms} mutedPeople={mutedPeople} onToggleMute={onToggleMute} />
    {error && <p className="auth-error community-chat-error">{error}</p>}
  </section>;
}

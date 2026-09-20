"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, CornerDownRight, Gift, ImagePlus, Images, LoaderCircle, MessageCircle, Reply, Send, Star, Trash2, UserPlus, UsersRound, VenusAndMars, X } from "lucide-react";
import type { Attachment, AuthUser, Person, ProfilePost, PublicProfile } from "@/lib/chat-contract";
import { createProfilePost, deleteProfilePost, fetchProfilePosts, fetchPublicProfile, uploadAttachment } from "@/lib/social-api";
import { Avatar } from "./avatar";
import { commentAlbumPhoto, toggleAlbumPhotoLike } from "@/lib/profile-albums-api";

const roleLabels = { user: "участник", moderator: "модератор", admin: "администратор" } as const;
const statusLabels = { online: "в сети", away: "нет на месте", dnd: "не беспокоить", offline: "не в сети" } as const;

export function PublicProfileModal({ person, currentUser, onWriteDirect, onClose }: { person: Person; currentUser: AuthUser; onWriteDirect: () => Promise<void>; onClose: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openingDirect, setOpeningDirect] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!person.id) return;
    try {
      const [nextProfile, nextPosts] = await Promise.all([fetchPublicProfile(person.id), fetchProfilePosts(person.id)]);
      setProfile(nextProfile); setPosts(nextPosts);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить профиль"); }
  }
  useEffect(() => { void load(); }, [person.id]);

  async function submit(event: FormEvent, parentId?: string) {
    event.preventDefault();
    if (!person.id) return;
    const value = (parentId ? reply : body).trim();
    if (!value) return;
    setBusy(true); setError("");
    try {
      await createProfilePost(person.id, value, parentId, parentId ? undefined : attachment?.id);
      setBody(""); setReply(""); setReplyTo(null); setAttachment(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отправить сообщение"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try { await deleteProfilePost(id); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось удалить сообщение"); }
  }

  async function interactPhoto(photoId: string, comment = false) {
    try {
      if (comment) { const body = window.prompt("Комментарий к фотографии"); if (!body?.trim()) return; await commentAlbumPhoto(photoId, body); }
      else await toggleAlbumPhotoLike(photoId);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие"); }
  }

  async function writeDirect() {
    if (openingDirect) return;
    setOpeningDirect(true);
    try { await onWriteDirect(); }
    finally { setOpeningDirect(false); }
  }

  async function selectAttachment(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("К записи можно прикрепить только изображение"); return; }
    setUploading(true); setError("");
    try { setAttachment(await uploadAttachment(file)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить изображение"); }
    finally { setUploading(false); }
  }

  const name = profile?.displayName ?? person.name;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal public-profile-modal aura-profile-modal" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
    <header className="aura-profile-head">
      <Avatar value={profile?.avatarUrl ?? person.avatar} name={name} className="profile-avatar aura-profile-avatar" />
      <div className="aura-profile-identity"><span className="eyebrow">ПРОФИЛЬ</span><h2>{name}{person.isBot && " · бот"}</h2><p>@{profile?.username ?? "пользователь"}</p><small><i className={`profile-status-dot ${profile?.status ?? person.status}`} />{roleLabels[profile?.role ?? "user"]} · <b>{statusLabels[profile?.status ?? person.status]}</b></small></div>
      <div className="aura-profile-actions"><button type="button" className="action-button" onClick={() => void writeDirect()}><MessageCircle size={17} /><span>Написать лично</span></button><button type="button" className="profile-add-friend"><UserPlus size={17} /><span>Добавить в друзья</span></button></div>
    </header>
    {profile?.bio && <p className="profile-bio aura-profile-bio">{profile.bio}</p>}
    {profile && <>
      <section className="profile-facts aura-profile-facts"><span><Star size={17} />{profile.rating} рейтинг</span><span><CalendarDays size={17} />В чате с {new Date(profile.createdAt).toLocaleDateString("ru-RU")}</span><span><VenusAndMars size={17} />{profile.gender === "male" ? "Мужской" : profile.gender === "female" ? "Женский" : "Не указан"} пол</span><span><MessageCircle size={17} />{profile.stats.messages} сообщений</span></section>
      <section className="profile-collections aura-profile-collections">
        <article><div className="aura-collection-title"><Gift size={21} /><h3>Подарки</h3><small>{profile.gifts.length} {profile.gifts.length === 1 ? "подарок" : "подарков"}</small><ChevronRight size={18} /></div>{profile.gifts.length > 0 && <div className="profile-gift"><span>{profile.gifts[0].gift.emoji}</span><div><b>{profile.gifts[0].gift.name}</b><small>{profile.gifts[0].sender ? "От " + profile.gifts[0].sender.displayName : "Подарок"}</small>{profile.gifts[0].message && <em>{profile.gifts[0].message}</em>}</div></div>}</article>
        <article><div className="aura-collection-title"><MessageCircle size={21} /><h3>Комнаты</h3><small>{profile.rooms.length} {profile.rooms.length === 1 ? "комната" : "комнат"}</small><ChevronRight size={18} /></div>{profile.rooms.length > 0 && <div className="profile-chip-list">{profile.rooms.map((item) => <span key={item.id}>{item.name}</span>)}</div>}</article>
        {profile.albums.length > 0 && <article className="aura-profile-albums"><div className="aura-collection-title"><Images size={21} /><h3>Фотоальбомы</h3><small>{profile.albums.length}</small><ChevronRight size={18} /></div><div className="profile-album-list">{profile.albums.map((album) => <div className="profile-album" key={album.id}><b>{album.title}</b><div>{album.photos.map((photo) => <span className="public-album-photo" key={photo.id}><img src={photo.thumbnailUrl} alt={photo.originalName} /><span><button type="button" title="Нравится" aria-label="Нравится" onClick={() => void interactPhoto(photo.id)}>♥</button><button type="button" title="Комментировать" aria-label="Комментировать" onClick={() => void interactPhoto(photo.id, true)}>◌</button></span></span>)}</div></div>)}</div></article>}
      </section>
    </>}
    <section className="profile-wall aura-profile-wall">
      <div className="aura-wall-heading"><h3>Записи на стене</h3><small>{posts.length} {posts.length === 1 ? "запись" : "записей"}</small></div>
      <form className="profile-post-form aura-post-form" onSubmit={(event) => void submit(event)}><Avatar value={currentUser.avatarUrl ?? ""} name={currentUser.displayName} /><input value={body} maxLength={500} onChange={(event) => setBody(event.target.value)} placeholder="Оставить сообщение..." /><label className="profile-post-attach" title="Прикрепить фото" aria-label="Прикрепить фото"><ImagePlus size={16} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void selectAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button aria-label="Отправить" disabled={busy || uploading || !body.trim()}>{uploading ? <LoaderCircle className="spin" size={17} /> : <Send size={18} />}</button></form>
      {attachment && <div className="profile-post-preview"><img src={attachment.previewUrl ?? attachment.url} alt="Выбранное фото" /><span>{attachment.originalName}</span><button type="button" aria-label="Убрать фото" title="Убрать фото" onClick={() => setAttachment(null)}><X size={14} /></button></div>}
      {error && <div className="auth-error">{error}</div>}
      <div className="profile-post-list">{posts.length === 0 ? <p className="direct-empty">Сообщений пока нет.</p> : posts.map((post) => <article className="profile-post" key={post.id}>
        <div className="profile-post-line"><Avatar value={post.author.avatarUrl ?? ""} name={post.author.displayName} /><div><strong>{post.author.displayName}</strong><span>{post.body}</span><time>{new Date(post.createdAt).toLocaleString("ru-RU")}</time></div><button aria-label="Ответить" title="Ответить" onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}><Reply size={15} /></button>{(post.author.id === currentUser.id || person.id === currentUser.id || currentUser.role !== "user") && <button aria-label="Удалить" title="Удалить" onClick={() => void remove(post.id)}><Trash2 size={15} /></button>}</div>
        {post.attachment && <img className="profile-post-image" src={post.attachment.previewUrl ?? post.attachment.url} alt={post.attachment.originalName} />}
        {post.replies.map((item) => <div className="profile-reply" key={item.id}><CornerDownRight size={14} /><Avatar value={item.author.avatarUrl ?? ""} name={item.author.displayName} /><div><strong>{item.author.displayName}</strong><span>{item.body}</span><time>{new Date(item.createdAt).toLocaleString("ru-RU")}</time></div></div>)}
        {replyTo === post.id && <form className="profile-reply-form" onSubmit={(event) => void submit(event, post.id)}><input autoFocus value={reply} maxLength={500} onChange={(event) => setReply(event.target.value)} placeholder="Ответить..." /><button aria-label="Отправить ответ" disabled={busy || !reply.trim()}><Send size={14} /></button></form>}
      </article>)}</div>
    </section>
  </div></div>;
}
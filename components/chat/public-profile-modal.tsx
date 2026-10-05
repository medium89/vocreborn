"use client";

import { Headphones } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, CornerDownRight, Crown, Gift, Image as ImageIcon, ImagePlus, Images, Heart, LoaderCircle, MessageCircle, Reply, Send, ShieldCheck, Star, Trash2, UserPlus, VenusAndMars, X } from "lucide-react";
import type { Attachment, AuthUser, FriendSummary, Person, ProfilePost, PublicProfile } from "@/lib/chat-contract";
import { addFriend, createProfilePost, deleteProfilePost, fetchFriends, fetchProfilePosts, fetchPublicProfile, removeFriend, toggleProfilePostLike, uploadAttachment } from "@/lib/social-api";
import { Avatar } from "./avatar";
import { StyledName } from "./cosmetics";
import { UserRankBadge } from "./user-rank";
import { commentAlbumPhoto, toggleAlbumPhotoLike } from "@/lib/profile-albums-api";
import { API_URL } from "@/lib/chat-api";
import { prepareProfilePostImage } from "@/lib/profile-post-image";

const statusLabels = { online: "в сети", away: "нет на месте", dnd: "не беспокоить", offline: "не в сети" } as const;
type Collection = "gifts" | "albums";

export function PublicProfileModal({ person, currentUser, onWriteDirect, onOpenFriend, onBalanceChanged, onClose }: { person: Person; currentUser: AuthUser; onWriteDirect: () => Promise<void>; onOpenFriend: (friend: Person) => void; onBalanceChanged: () => void; onClose: () => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [body, setBody] = useState(""); const [replyTo, setReplyTo] = useState<string | null>(null); const [reply, setReply] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null); const [uploading, setUploading] = useState(false);
  const [openingDirect, setOpeningDirect] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{ id?: string; url: string; originalName: string } | null>(null);
  const [selectedGift, setSelectedGift] = useState<PublicProfile["gifts"][number] | null>(null);

  async function load() {
    if (!person.id) return;
    try { const [nextProfile, nextPosts, nextFriends] = await Promise.all([fetchPublicProfile(person.id), fetchProfilePosts(person.id), fetchFriends(person.id)]); setProfile(nextProfile); setPosts(nextPosts); setFriends(nextFriends); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить профиль"); }
  }
  useEffect(() => { setProfile(null); setPosts([]); setFriends([]); setFriendsOpen(false); setSelectedPhoto(null); setSelectedGift(null); void load(); }, [person.id]);

  async function submit(event: FormEvent, parentId?: string) {
    event.preventDefault(); if (!person.id) return; const value = (parentId ? reply : body).trim(); if (!value && (parentId || !attachment)) return;
    setBusy(true); setError("");
    try { await createProfilePost(person.id, value, parentId, parentId ? undefined : attachment?.id); setBody(""); setReply(""); setReplyTo(null); setAttachment(null); onBalanceChanged(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отправить сообщение"); } finally { setBusy(false); }
  }
  async function remove(id: string) { try { await deleteProfilePost(id); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось удалить сообщение"); } }
  async function togglePostLike(id: string) { try { await toggleProfilePostLike(id); setError(""); onBalanceChanged(); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось оценить сообщение"); } }
  async function interactPhoto(photoId: string, comment = false) {
    try { if (comment) { const text = window.prompt("Комментарий к фотографии"); if (!text?.trim()) return; await commentAlbumPhoto(photoId, text); } else await toggleAlbumPhotoLike(photoId); setError(""); onBalanceChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие"); }
  }
  async function writeDirect() { if (openingDirect) return; setOpeningDirect(true); try { await onWriteDirect(); } finally { setOpeningDirect(false); } }
  async function toggleFriend() {
    if (!person.id || friendBusy) return;
    setFriendBusy(true); setError("");
    try {
      if (friends.some((friend) => friend.id === currentUser.id)) await removeFriend(person.id);
      else await addFriend(person.id);
      setFriends(await fetchFriends(person.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить список друзей"); }
    finally { setFriendBusy(false); }
  }
  function openFriend(friend: FriendSummary) {
    setFriendsOpen(false);
    onOpenFriend({ id: friend.id, username: friend.username, name: friend.displayName, avatar: friend.avatarUrl ?? "", status: friend.status, role: friend.role, gender: friend.gender, room: "" });
  }
  async function selectAttachment(file?: File) {
    if (!file) return; if (!file.type.startsWith("image/")) { setError("К записи можно прикрепить только изображение"); return; }
    setUploading(true); setError(""); try { const prepared = await prepareProfilePostImage(file); setAttachment(await uploadAttachment(prepared)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить изображение"); } finally { setUploading(false); }
  }
  const name = profile?.displayName ?? person.name;
  const gifts = profile?.gifts ?? []; const albums = profile?.albums ?? [];
  const photoCount = albums.reduce((count, album) => count + album.photos.length, 0);
  const isFriend = friends.some((friend) => friend.id === currentUser.id);
  const profileRole = (profile?.hideRole ?? person.hideRole) ? "user" : (profile?.role ?? person.role);
  const profileDj = Boolean((profile?.isDj ?? person.isDj) && !(profile?.hideDj ?? person.hideDj));
  const isVip = Boolean(profile?.appearance?.vip && profile.appearance.vip.enabled !== false);
  const avatarUrl = profile?.avatarUrl ?? person.avatar;
  const friendCard = (friend: FriendSummary) => <button type="button" className="profile-friend-card" key={friend.id} onClick={() => openFriend(friend)}><Avatar value={friend.avatarUrl ?? ""} name={friend.displayName} /><span><strong>{friend.displayName}</strong></span></button>;
  const giftVisual = (item: PublicProfile["gifts"][number]) => <span>{item.gift.imageUrl ? <img src={item.gift.imageUrl} alt={item.gift.name} /> : item.gift.emoji}</span>;

  return <div className="modal-backdrop" onClick={onClose}><div className="modal public-profile-modal aura-profile-modal aura-profile-reference" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={19} /></button>
    <header className={"aura-profile-head" + (profileDj ? " aura-profile-dj" : "") + (profile?.appearance?.profileCover?.enabled !== false && profile?.appearance?.profileCover ? " cover-" + profile.appearance.profileCover.theme : "")}>
      <button type="button" className="profile-avatar-open" disabled={!avatarUrl} aria-label={"Увеличить фото " + name} onClick={() => avatarUrl && setSelectedPhoto({ url: avatarUrl, originalName: "Фото " + name })}><Avatar value={avatarUrl} name={name} className={"profile-avatar aura-profile-avatar" + (profile?.appearance?.avatarFrame?.enabled !== false && profile?.appearance?.avatarFrame ? " frame-" + profile.appearance.avatarFrame.theme : "")} /></button>
      <div className="aura-profile-identity"><h2><StyledName name={name} appearance={profile?.appearance} avatarUrl={profile?.avatarThumbnailUrl ?? person.avatar} showVipCrown={false} />{person.isBot && " · бот"}</h2>{profile?.appearance?.customStatus?.enabled !== false && profile?.appearance?.customStatus?.text && <p className="profile-custom-status">{profile.appearance.customStatus.text}</p>}<div className="aura-profile-badges">{profileDj && <span className="person-role-badge person-role-badge-dj"><Headphones size={13} />DJ</span>}{isVip && <span className="person-role-badge person-role-badge-vip"><Crown size={13} fill="currentColor" />VIP</span>}{profileRole === "admin" && <span className="person-role-badge person-role-badge-admin"><ShieldCheck size={13} />Администратор</span>}{profileRole === "moderator" && <span className="person-role-badge person-role-badge-moderator"><Star size={13} fill="currentColor" />Модератор</span>}</div><small><i className={"profile-status-dot " + (profile?.status ?? person.status)} /><UserRankBadge rating={profile?.rating ?? 0} /> · <b>{statusLabels[profile?.status ?? person.status]}</b></small></div>
      {person.id !== currentUser.id && <div className="aura-profile-actions"><button type="button" className="action-button" disabled={openingDirect} onClick={() => void writeDirect()}><MessageCircle size={17} />Написать лично</button><button type="button" className="profile-add-friend" disabled={friendBusy} onClick={() => void toggleFriend()}><UserPlus size={17} />{friendBusy ? "Сохраняем…" : isFriend ? "Удалить из друзей" : "Добавить в друзья"}</button></div>}
    </header>
    {profile?.bio && <p className="profile-bio aura-profile-bio">{profile.bio}</p>}
    {profile && <>
      <section className="profile-facts aura-profile-facts"><span><Star size={17} />{profile.rating} рейтинг</span><span><CalendarDays size={17} />В чате с {new Date(profile.createdAt).toLocaleDateString("ru-RU")}</span><span><VenusAndMars size={17} />{profile.gender === "male" ? "Мужской" : profile.gender === "female" ? "Женский" : "Не указан"} пол</span><span><MessageCircle size={17} />{profile.stats.messages} сообщений</span></section>
      <section className="aura-profile-friends"><header><h3>Друзья <small>{friends.length}</small></h3><button type="button" onClick={() => setFriendsOpen(true)}>Все друзья <ChevronRight size={16} /></button></header>{friends.length ? <div className="profile-friends-grid">{friends.slice(0, 5).map(friendCard)}</div> : <p>Пока нет друзей.</p>}</section>
      <section className="aura-profile-showcase">
        <article className="aura-showcase-card"><header><span><Gift size={22} /><b>Подарки</b><small>{gifts.length} {gifts.length === 1 ? "подарок" : "подарков"}</small></span><button type="button" onClick={() => setCollection("gifts")}>Все подарки <ChevronRight size={16}/></button></header>
          {gifts.length ? <div className="aura-gift-grid">{gifts.slice(0, 8).map((item) => <button type="button" className="aura-gift-card" key={item.id} onClick={() => setSelectedGift(item)}>{giftVisual(item)}<b>{item.gift.name}</b><small>{item.sender ? "От " + item.sender.displayName : "Подарок"}</small>{item.message && <em>{item.message}</em>}</button>)}</div> : <p className="aura-empty-collection">Подарков пока нет.</p>}
        </article>
        <article className="aura-showcase-card"><header><span><Images size={22} /><b>Фотоальбомы</b><small>{albums.length} альбомов · {photoCount} фото</small></span><button type="button" onClick={() => setCollection("albums")}>Все альбомы <ChevronRight size={16}/></button></header>
          {albums.length ? <div className="aura-album-grid">{albums.slice(0, 3).map((album) => <button type="button" className="aura-album-card" key={album.id} onClick={() => setCollection("albums")}>{album.photos[0] ? <img src={album.photos[0].thumbnailUrl} alt={album.title} /> : <span className="aura-album-empty"><Images size={24}/></span>}<span><b>{album.title}</b><small>{album.photos.length} фото</small></span></button>)}</div> : <p className="aura-empty-collection">Фотоальбомов пока нет.</p>}
        </article>
      </section>
    </>}
    <section className="profile-wall aura-profile-wall">
      <div className="aura-wall-heading"><h3>Записи на стене</h3><small>{posts.length} {posts.length === 1 ? "запись" : "записей"}</small></div>
      <form className="profile-post-form aura-post-form" onSubmit={(event) => void submit(event)}><Avatar value={currentUser.avatarUrl ?? ""} name={currentUser.displayName} /><input value={body} maxLength={500} onChange={(event) => setBody(event.target.value)} placeholder="Оставить сообщение..." /><label className="profile-post-attach" title="Прикрепить фото" aria-label="Прикрепить фото"><ImagePlus size={16} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void selectAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button aria-label="Отправить" disabled={busy || uploading || (!body.trim() && !attachment)}>{uploading ? <LoaderCircle className="spin" size={17} /> : <Send size={18} />}</button></form>
      {attachment && <div className="profile-post-preview"><img src={API_URL + (attachment.previewUrl ?? attachment.url)} alt="Выбранное фото" /><span>{attachment.originalName}</span><button type="button" aria-label="Убрать фото" title="Убрать фото" onClick={() => setAttachment(null)}><X size={14} /></button></div>}
      {error && <div className="auth-error">{error}</div>}
      <div className="profile-post-list">{posts.length === 0 ? <p className="direct-empty">Сообщений пока нет.</p> : posts.map((post) => <article className="profile-post" key={post.id}><div className="profile-post-line"><Avatar value={post.author.avatarUrl ?? ""} name={post.author.displayName} /><div><strong>{post.author.displayName}</strong><span>{post.body}</span><time>{new Date(post.createdAt).toLocaleString("ru-RU")}</time></div><button aria-label="Ответить" title="Ответить" onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}><Reply size={15} /></button><button className={"profile-post-like " + (post.likedByMe ? "liked" : "")} aria-label={post.likedByMe ? "Убрать оценку" : "Оценить сообщение"} title={post.likedByMe ? "Убрать оценку" : "Нравится"} onClick={() => void togglePostLike(post.id)}><Heart size={14} fill={post.likedByMe ? "currentColor" : "none"} /><small>{post.likeCount || ""}</small></button>{(post.author.id === currentUser.id || person.id === currentUser.id || currentUser.role !== "user") && <button aria-label="Удалить" title="Удалить" onClick={() => void remove(post.id)}><Trash2 size={15} /></button>}</div>{post.attachment && <button type="button" className="profile-post-image-button" aria-label={"Открыть фото " + post.attachment.originalName} onClick={() => setSelectedPhoto({ url: API_URL + post.attachment!.url, originalName: post.attachment!.originalName })}><img className="profile-post-image" src={API_URL + post.attachment.url} alt={post.attachment.originalName} /></button>}{post.replies.map((item) => <div className="profile-reply" key={item.id}><CornerDownRight size={14} /><Avatar value={item.author.avatarUrl ?? ""} name={item.author.displayName} /><div><strong>{item.author.displayName}</strong><span>{item.body}</span><time>{new Date(item.createdAt).toLocaleString("ru-RU")}</time></div><button className={"profile-post-like " + (item.likedByMe ? "liked" : "")} aria-label={item.likedByMe ? "Убрать оценку" : "Оценить комментарий"} title={item.likedByMe ? "Убрать оценку" : "Нравится"} onClick={() => void togglePostLike(item.id)}><Heart size={13} fill={item.likedByMe ? "currentColor" : "none"} /><small>{item.likeCount || ""}</small></button></div>)}{replyTo === post.id && <form className="profile-reply-form" onSubmit={(event) => void submit(event, post.id)}><input autoFocus value={reply} maxLength={500} onChange={(event) => setReply(event.target.value)} placeholder="Ответить..." /><button aria-label="Отправить ответ" disabled={busy || !reply.trim()}><Send size={14} /></button></form>}</article>)}</div>
    </section>
    {collection && <div className="profile-collection-backdrop" onClick={() => setCollection(null)}><section className="profile-collection-viewer" role="dialog" aria-modal="true" aria-label={collection === "gifts" ? "Все подарки" : "Все фотоальбомы"} onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">{collection === "gifts" ? "КОЛЛЕКЦИЯ" : "ФОТОГРАФИИ"}</span><h3>{collection === "gifts" ? "Все подарки" : "Все альбомы"}</h3></div><button type="button" aria-label="Закрыть" onClick={() => setCollection(null)}><X size={18}/></button></header>{collection === "gifts" ? <div className="aura-gift-grid aura-gift-grid-all">{gifts.map((item) => <button type="button" className="aura-gift-card" key={item.id} onClick={() => setSelectedGift(item)}>{giftVisual(item)}<b>{item.gift.name}</b><small>{item.sender ? "От " + item.sender.displayName : "Подарок"} · {new Date(item.createdAt).toLocaleDateString("ru-RU")}</small>{item.message && <em>{item.message}</em>}</button>)}</div> : <div className="aura-albums-all">{albums.map((album) => <article key={album.id}><header><b>{album.title}</b><small>{album.photos.length} фото</small></header><div>{album.photos.map((photo) => <button type="button" key={photo.id} onClick={() => setSelectedPhoto(photo)}><img src={photo.thumbnailUrl} alt={photo.originalName}/></button>)}</div></article>)}</div>}</section></div>}
    {friendsOpen && <div className="profile-collection-backdrop" onClick={() => setFriendsOpen(false)}><section className="profile-collection-viewer profile-friends-viewer" role="dialog" aria-modal="true" aria-label="Все друзья" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">ЛЮДИ РЯДОМ</span><h3>Друзья · {friends.length}</h3></div><button type="button" aria-label="Закрыть" onClick={() => setFriendsOpen(false)}><X size={18} /></button></header>{friends.length ? <div className="profile-friends-grid all">{friends.map(friendCard)}</div> : <p>Пока нет друзей.</p>}</section></div>}
    {selectedGift && <div className="profile-photo-backdrop" onClick={() => setSelectedGift(null)}><section className="profile-photo-viewer profile-gift-viewer" role="dialog" aria-modal="true" aria-label={"Подарок " + selectedGift.gift.name} onClick={(event) => event.stopPropagation()}><button type="button" aria-label="Закрыть" onClick={() => setSelectedGift(null)}><X size={18}/></button>{selectedGift.gift.imageUrl ? <img src={selectedGift.gift.imageUrl} alt={selectedGift.gift.name} /> : <span className="profile-gift-fallback">{selectedGift.gift.emoji}</span>}<div><h3>{selectedGift.gift.name}</h3><p>{selectedGift.gift.description}</p><small>{selectedGift.sender ? "От " + selectedGift.sender.displayName : "Подарок"} · {new Date(selectedGift.createdAt).toLocaleDateString("ru-RU")}</small>{selectedGift.message && <em>{selectedGift.message}</em>}</div></section></div>}
    {selectedPhoto && <div className="profile-photo-backdrop" onClick={() => setSelectedPhoto(null)}><section className="profile-photo-viewer" role="dialog" aria-modal="true" aria-label="Просмотр фотографии" onClick={(event) => event.stopPropagation()}><button type="button" aria-label="Закрыть" onClick={() => setSelectedPhoto(null)}><X size={18}/></button><img src={selectedPhoto.url} alt={selectedPhoto.originalName}/>{selectedPhoto.id && <footer><button type="button" onClick={() => void interactPhoto(selectedPhoto.id!)}>♥ Нравится</button><button type="button" onClick={() => void interactPhoto(selectedPhoto.id!, true)}><MessageCircle size={15}/> Комментировать</button></footer>}</section></div>}
  </div></div>;
}

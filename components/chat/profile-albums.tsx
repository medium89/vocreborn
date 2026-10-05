"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { createPhotoAlbum, deleteAlbumPhoto, deletePhotoAlbum, getPhotoAlbums, uploadAlbumPhoto, type PhotoAlbum } from "@/lib/profile-albums-api";

const DELETE_HOLD_MS = 2000;

export function ProfileAlbums({ vip = false }: { vip?: boolean }) {
  const albumLimit = vip ? 5 : 2;
  const photoLimit = vip ? 30 : 10;
  const [albums, setAlbums] = useState<PhotoAlbum[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDelete = useRef<string | null>(null);

  function cancelHold() {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    pendingDelete.current = null;
    setHoldingId(null);
  }

  useEffect(() => {
    let active = true;
    void getPhotoAlbums().then((items) => { if (active) setAlbums(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить альбомы"); })
      .finally(() => { if (active) setLoading(false); });
    const cancel = () => cancelHold();
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      active = false;
      if (holdTimer.current !== null) clearTimeout(holdTimer.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  }, []);

  async function create() {
    if (busy || !title.trim() || albums.length >= albumLimit) return;
    setBusy(true); setError("");
    try { const album = await createPhotoAlbum(title.trim()); setAlbums((items) => [...items, album]); setTitle(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать альбом"); }
    finally { setBusy(false); }
  }
  async function addPhoto(albumId: string, file: File | null) {
    if (!file || busy) return;
    cancelHold(); setBusy(true); setError("");
    try { const photo = await uploadAlbumPhoto(albumId, file); setAlbums((items) => items.map((album) => album.id === albumId ? { ...album, photos: [...album.photos, photo] } : album)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить фотографию"); }
    finally { setBusy(false); }
  }
  async function removeAlbum(albumId: string) {
    setBusy(true); setError("");
    try { await deletePhotoAlbum(albumId); setAlbums((items) => items.filter((album) => album.id !== albumId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить альбом"); }
    finally { setBusy(false); }
  }
  function startHold(albumId: string) {
    if (busy || pendingDelete.current) return;
    pendingDelete.current = albumId;
    setHoldingId(albumId);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      pendingDelete.current = null;
      setHoldingId(null);
      void removeAlbum(albumId);
    }, DELETE_HOLD_MS);
  }
  async function removePhoto(albumId: string, photoId: string) {
    if (busy) return;
    cancelHold(); setBusy(true); setError("");
    try { await deleteAlbumPhoto(albumId, photoId); setAlbums((items) => items.map((album) => album.id === albumId ? { ...album, photos: album.photos.filter((photo) => photo.id !== photoId) } : album)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить фотографию"); }
    finally { setBusy(false); }
  }
  const remaining = albumLimit - albums.length;
  return <section className="profile-settings-content profile-albums-content">

    <div className="profile-albums-body">
      {remaining > 0 && <form className="album-create" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <input ref={titleRef} aria-label="Название нового альбома" value={title} maxLength={80} disabled={busy || loading} onChange={(event) => setTitle(event.target.value)} placeholder="Название альбома" />
        <button type="submit" className="action-button" disabled={busy || loading || !title.trim()}><Plus size={18} />Создать</button>
      </form>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading && <p className="album-loading" role="status"><LoaderCircle size={18} className="spin" />Загрузка альбомов…</p>}
      {albums.map((album) => <article className="photo-album-card" key={album.id}>
        <header><div><strong>{album.title}</strong><small>{album.photos.length}/{photoLimit} фотографий</small></div>
          <button type="button" className={"album-delete" + (holdingId === album.id ? " holding" : "")}
            title="Удерживайте 2 секунды, чтобы удалить альбом со всеми фотографиями"
            aria-label={"Удалить альбом «" + album.title + "» и все фотографии: удерживайте 2 секунды"}
            disabled={busy}
            onClick={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); startHold(album.id); }}
            onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold} onBlur={cancelHold}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!event.repeat) startHold(album.id); } if (event.key === "Escape") cancelHold(); }}
            onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cancelHold(); } }}>
            <Trash2 size={17} />
          </button>
        </header>
        <div className="album-photo-grid">
          {album.photos.map((photo) => <figure key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer" aria-label={"Открыть фотографию " + photo.originalName}><img src={photo.thumbnailUrl} alt={photo.originalName} loading="lazy" /></a><button type="button" aria-label="Удалить фотографию" title="Удалить фотографию" disabled={busy} onClick={() => void removePhoto(album.id, photo.id)}><Trash2 size={13} /></button></figure>)}
          {album.photos.length < photoLimit && <label className={"album-upload" + (busy ? " busy" : "")}><Upload size={21} /><span>Добавить фото</span><input className="visually-hidden" type="file" aria-label={"Добавить фото в альбом " + album.title} accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { void addPhoto(album.id, event.target.files?.[0] ?? null); event.target.value = ""; }} /></label>}
          {Array.from({ length: Math.max(0, Math.min(7, photoLimit) - album.photos.length - (album.photos.length < photoLimit ? 1 : 0)) }, (_, index) => <span className="album-photo-placeholder" aria-hidden="true" key={index}><ImageIcon size={22} /></span>)}
        </div>
        {holdingId === album.id && <span className="album-hold-hint" role="status">Удерживайте — альбом и все фотографии будут удалены</span>}
      </article>)}
      {!loading && remaining > 0 && <button type="button" className="album-create-tile" disabled={busy} onClick={() => { titleRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); titleRef.current?.focus({ preventScroll: true }); }}>
        <span className="album-create-tile-icon"><Plus size={30} /></span>
        <strong>{albums.length === 0 ? "Создать первый альбом" : albums.length === 1 ? "Создать второй альбом" : "Создать ещё альбом"}</strong>
        <small>Можно создать ещё {remaining} {remaining === 1 ? "альбом" : remaining < 5 ? "альбома" : "альбомов"}</small>
      </button>}
    </div>
  </section>;
}

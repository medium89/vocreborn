"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, RotateCcw, X } from "lucide-react";
import { avatarCropRectangle, encodeAvatarCrop, type AvatarCrop } from "@/lib/avatar-crop";

export function AvatarPicker({ label, className, disabled, onSelected }: {
  label: string; className: string; disabled?: boolean; onSelected: (file: File) => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<AvatarCrop>({ x: 50, y: 50, zoom: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: AvatarCrop } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSource(url); setDimensions({ width: 0, height: 0 });
    setCrop({ x: 50, y: 50, zoom: 1 }); setError("");
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function close() {
    if (busy) return;
    dialog.current?.close(); setFile(null); setSource(""); drag.current = null;
  }
  async function apply() {
    if (!image.current || !dimensions.width || busy) return;
    setBusy(true); setError("");
    try {
      const result = await encodeAvatarCrop(image.current, crop);
      await onSelected(result);
      dialog.current?.close(); setFile(null); setSource("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось подготовить аватар"); }
    finally { setBusy(false); }
  }
  const rect = avatarCropRectangle(dimensions.width, dimensions.height, crop);
  const ready = dimensions.width > 0 && !error;
  return <>
    <label className={className}><Camera size={16} />{label}<input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy} onChange={event => {
      const next = event.target.files?.[0]; event.target.value = "";
      if (next) setFile(next);
    }} /></label>
    {file && createPortal(<dialog ref={dialog} className="avatar-crop-dialog" aria-labelledby="avatar-crop-title" aria-describedby="avatar-crop-help" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }} onCancel={event => { event.preventDefault(); close(); }}>
      <header><h2 id="avatar-crop-title">Выберите область аватара</h2><button type="button" aria-label="Закрыть выбор области" disabled={busy} onClick={close}><X size={20} /></button></header>
      <p id="avatar-crop-help">Двигайте фото мышью или пальцем и настройте масштаб. В аватар попадёт квадратная область; круг показывает, как фото будет выглядеть в чате.</p>
      <div className="avatar-crop-stage" tabIndex={0} role="group" aria-label="Область аватара. Используйте стрелки для перемещения фото" onKeyDown={event => {
        const changes: Record<string, [number, number]> = { ArrowLeft: [2, 0], ArrowRight: [-2, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] };
        const change = changes[event.key]; if (!change || !ready || busy) return;
        event.preventDefault(); setCrop(value => ({ ...value, x: Math.max(0, Math.min(100, value.x + change[0])), y: Math.max(0, Math.min(100, value.y + change[1])) }));
      }} onPointerDown={event => {
        if (!ready || busy || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop };
      }} onPointerMove={event => {
        const start = drag.current; if (!start || start.id !== event.pointerId) return;
        const size = event.currentTarget.getBoundingClientRect().width;
        const area = avatarCropRectangle(dimensions.width, dimensions.height, start.crop);
        const move = (delta: number, overflow: number) => overflow > 0 ? delta / size * area.size / overflow * 100 : 0;
        setCrop({ ...start.crop, x: Math.max(0, Math.min(100, start.crop.x - move(event.clientX - start.x, dimensions.width - area.size))), y: Math.max(0, Math.min(100, start.crop.y - move(event.clientY - start.y, dimensions.height - area.size))) });
      }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {source && <img ref={image} src={source} alt="Предпросмотр выбранной области" draggable={false} style={dimensions.width ? { width: dimensions.width / rect.size * 100 + "%", height: dimensions.height / rect.size * 100 + "%", left: -rect.x / rect.size * 100 + "%", top: -rect.y / rect.size * 100 + "%" } : { visibility: "hidden" }} onLoad={event => {
          const img = event.currentTarget;
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Выберите JPG, PNG или WebP"); return; }
          if (file.size > 10 * 1024 * 1024 || img.naturalWidth * img.naturalHeight > 40_000_000) { setError("Фото должно быть не больше 10 МБ и 40 мегапикселей"); return; }
          setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        }} onError={() => setError("Не удалось открыть изображение. Выберите другой файл")} />}
      </div>
      <label className="avatar-crop-zoom">Масштаб <input type="range" min="1" max="4" step="0.01" value={crop.zoom} disabled={!ready || busy} onChange={event => setCrop(value => ({ ...value, zoom: Number(event.target.value) }))} /><output>{Math.round(crop.zoom * 100)}%</output></label>
      <button type="button" className="avatar-crop-reset" disabled={busy} onClick={() => setCrop({ x: 50, y: 50, zoom: 1 })}><RotateCcw size={14} />По центру</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <footer><button type="button" className="action-button secondary" disabled={busy} onClick={close}>Отмена</button><button type="button" className="action-button" disabled={!ready || busy} onClick={() => void apply()}>{busy ? "Подготовка…" : "Использовать область"}</button></footer>
    </dialog>, document.body)}
  </>;
}

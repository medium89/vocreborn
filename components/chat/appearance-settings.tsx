"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bold, ChevronRight, Italic, Palette, Settings, X } from "lucide-react";
import type { CosmeticAppearance } from "@/lib/chat-contract";
import { CosmeticIcon, CosmeticSettingsDialog, cosmeticLabels, messageColorPalette } from "./cosmetics";
import { saveCosmetic } from "@/lib/social-api";

const groups = [
  { title: "Никнейм", keys: ["colorNick", "gradientNick", "pictureNick"] },
  { title: "Сообщения", keys: ["messageColor", "boldText", "italicText", "gradientText"] },
  { title: "Профиль", keys: ["avatarFrame", "profileCover", "customStatus", "vip"] },
];

function AppearanceOptions({ appearance, onSelect, includeProfile = true }: { appearance: CosmeticAppearance; onSelect: (key: string) => void; includeProfile?: boolean }) {
  const available = (includeProfile ? groups : groups.slice(0, 2)).map((group) => ({
    ...group,
    keys: group.keys.filter((key) => (includeProfile || !["messageColor", "boldText", "italicText"].includes(key)) && (key === "messageColor" || appearance[key])),
  })).filter((group) => group.keys.length);
  if (!available.length) return <div className="appearance-empty"><Palette size={28} /><strong>Пока нет настроек оформления</strong><p>После покупки улучшений в магазине они появятся здесь.</p></div>;
  return <div className="appearance-option-groups">{available.map((group) => <section key={group.title}><h4>{group.title}</h4><div>{group.keys.map((key) => {
    const configured = Boolean(appearance[key]);
    const enabled = appearance[key]?.enabled !== false;
    return <button type="button" className="appearance-option" key={key} onClick={() => onSelect(key)} aria-label={"Настроить: " + cosmeticLabels[key]}>
      <span className="appearance-option-icon"><CosmeticIcon effectKey={key} size={19} /></span>
      <span className="appearance-option-copy"><strong>{cosmeticLabels[key]}</strong><small className={configured && enabled ? "is-enabled" : ""}><i />{configured ? (enabled ? "Включено" : "Выключено") : "Доступно"}</small></span>
      <ChevronRight size={15} />
    </button>;
  })}</div></section>)}</div>;
}

type AppearanceProps = { appearance?: CosmeticAppearance; onSaved: (next: CosmeticAppearance) => void };

export function ProfileAppearanceSettings({ appearance = {}, onSaved }: AppearanceProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return <section className="profile-settings-content profile-appearance-settings">
    <header><h2>Оформление</h2><p>Настройте никнейм, сообщения и профиль. Здесь собраны все доступные вам улучшения.</p></header>
    <AppearanceOptions appearance={appearance} onSelect={setSelected} />
    {selected && createPortal(<CosmeticSettingsDialog effectKey={selected} appearance={appearance} onSaved={onSaved} onClose={() => setSelected(null)} />, document.body)}
  </section>;
}

export function ComposerMessageColorPicker({ appearance = {}, onSaved }: AppearanceProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLElement>(null);
  const popupId = useId();
  const currentColor = typeof appearance.messageColor?.color === "string" ? appearance.messageColor.color : "#008750";
  const close = () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(346, window.innerWidth - 24);
      const above = rect.top > window.innerHeight - rect.bottom;
      setPosition({
        width, left: Math.max(12, Math.min(rect.left - 32, window.innerWidth - width - 12)),
        ...(above ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(80, rect.top - 20) } : { top: rect.bottom + 8, maxHeight: Math.max(80, window.innerHeight - rect.bottom - 20) }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function selectColor(color: string) {
    if (busy) return;
    if (color === currentColor && appearance.messageColor && appearance.messageColor.enabled !== false) { close(); return; }
    setBusy(true); setError("");
    try { onSaved(await saveCosmetic("messageColor", { enabled: true, color })); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить цвет"); }
    finally { setBusy(false); }
  }

  return <div className="composer-message-color-row">
    <button ref={triggerRef} type="button" className={"composer-message-color-trigger" + (open ? " active" : "")} title="Цвет сообщений и ника" aria-label="Выбрать цвет сообщений и ника" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined} onClick={() => setOpen((value) => !value)}><Palette size={18} /></button>
    {open && createPortal(<section ref={popupRef} id={popupId} className="composer-message-color-popup" role="dialog" aria-label="Цвет сообщений и ника" style={{ ...position, visibility: position ? "visible" : "hidden" }}>
      <div className="message-color-swatches">{messageColorPalette.map(([color, title]) => <button type="button" key={color} className={color === currentColor ? "selected" : ""} style={{ backgroundColor: color }} aria-pressed={color === currentColor} aria-label={"Выбрать цвет: " + title} title={title} disabled={busy} onClick={() => void selectColor(color)} />)}</div>
      {error && <p className="message-color-error" role="alert">{error}</p>}
    </section>, document.body)}
  </div>;
}

export function ComposerTextStyleToggles({ appearance = {}, onSaved }: AppearanceProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const styles = [
    { key: "boldText", icon: Bold, label: "Жирный текст сообщений" },
    { key: "italicText", icon: Italic, label: "Курсивный текст сообщений" },
  ].filter(({ key }) => Boolean(appearance[key]));
  if (!styles.length) return null;

  async function toggle(key: string) {
    if (busyKey) return;
    setBusyKey(key);
    setError("");
    try {
      onSaved(await saveCosmetic(key, { enabled: appearance[key]?.enabled === false }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить оформление");
    } finally {
      setBusyKey(null);
    }
  }

  return <div className="composer-text-style-toggles">
    {styles.map(({ key, icon: Icon, label }) => <button key={key} type="button" className={"composer-text-style-toggle" + (appearance[key]?.enabled !== false ? " active" : "") + (key === "italicText" ? " italic" : "")} aria-label={label} title={label} aria-pressed={appearance[key]?.enabled !== false} disabled={busyKey !== null} onClick={() => void toggle(key)}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></button>)}
    {error && <span className="composer-text-style-error" role="alert">{error}</span>}
  </div>;
}

export function ComposerAppearanceMenu({ appearance = {}, onSaved }: AppearanceProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const close = () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, window.innerWidth - 24);
      const above = rect.top > window.innerHeight - rect.bottom;
      setPosition({
        width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(above ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(80, rect.top - 20) } : { top: rect.bottom + 8, maxHeight: Math.max(80, window.innerHeight - rect.bottom - 20) }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  return <div className="composer-appearance-row" onSubmit={(event) => event.stopPropagation()}>
    <button ref={triggerRef} type="button" className={"composer-appearance-trigger" + (open ? " active" : "")} title="Оформление" aria-label="Настройки оформления" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined} onClick={() => setOpen((value) => !value)}><Settings size={18} /></button>
    {open && createPortal(<section ref={popupRef} id={popupId} className="composer-appearance-popup" role="dialog" aria-label="Оформление чата" style={{ ...position, visibility: position ? "visible" : "hidden" }}>
      <header><span className="appearance-popup-icon"><Palette size={19} /></span><div><h3>Оформление</h3><p>Ваши доступные настройки</p></div><button ref={closeRef} type="button" aria-label="Закрыть настройки оформления" onClick={close}><X size={17} /></button></header>
      <AppearanceOptions appearance={appearance} includeProfile={false} onSelect={(key) => { setOpen(false); setSelected(key); }} />
    </section>, document.body)}
    {selected && createPortal(<CosmeticSettingsDialog effectKey={selected} appearance={appearance} onSaved={onSaved} onClose={() => { setSelected(null); triggerRef.current?.focus({ preventScroll: true }); }} />, document.body)}
  </div>;
}

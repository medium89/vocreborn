"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { StyledSelect } from "./styled-select";
import { Crown, Save, X } from "lucide-react";
import type { CosmeticAppearance } from "@/lib/chat-contract";
import { saveCosmetic } from "@/lib/social-api";

export const cosmeticLabels: Record<string, string> = {
  messageColor: "Цвет сообщений и ника", boldText: "Жирный текст сообщений", italicText: "Курсивный текст сообщений", colorNick: "Цветной ник", gradientNick: "Градиентный ник",
  gradientText: "Градиентный текст", pictureNick: "Ник с картинкой",
  avatarFrame: "Рамка аватара", profileCover: "Обложка профиля",
  customStatus: "Личный статус", vip: "VIP-оформление",
};
export const cosmeticDefaults: CosmeticAppearance = {
  messageColor: { enabled: true, color: "#008750" }, boldText: { enabled: true }, italicText: { enabled: true }, colorNick: { enabled: true, color: "#70a900" },
  gradientNick: { enabled: true, start: "#70a900", end: "#0096a6" },
  gradientText: { enabled: true, start: "#70a900", end: "#0096a6" },
  pictureNick: { enabled: true, preset: "avatar" }, avatarFrame: { enabled: true, theme: "lime" },
  profileCover: { enabled: true, theme: "meadow" }, customStatus: { enabled: true, text: "" }, vip: { enabled: true },
};
export const messageColorPalette = [
  ["#d62828", "Красный"], ["#ed7d00", "Оранжевый"], ["#d7b600", "Золотой"], ["#70a900", "Лаймовый"], ["#008750", "Зелёный"],
  ["#0096a6", "Бирюзовый"], ["#2869de", "Синий"], ["#8148ca", "Фиолетовый"], ["#cf2e9e", "Малиновый"], ["#744222", "Коричневый"],
  ["#002673", "Ночной синий"], ["#2bd9bc", "Мятный"], ["#ff66ff", "Светлая фуксия"], ["#730060", "Тёмная слива"], ["#0000d9", "Ультрамарин"],
  ["#66b3ff", "Небесный"], ["#006073", "Морская волна"], ["#ff6699", "Кораллово-розовый"], ["#5300a6", "Тёмный фиолетовый"], ["#d400ff", "Сиреневый"],
  ["#a66e00", "Охра"], ["#00d900", "Ярко-зелёный"], ["#5500ff", "Электрический индиго"], ["#a62163", "Ягодный"], ["#730013", "Вишнёвый"],
  ["#b366ff", "Лавандовый"], ["#214da6", "Кобальтовый"], ["#a60000", "Тёмно-красный"], ["#ff00d4", "Неоновый розовый"], ["#8a00a6", "Пурпурный"],
] as const;
const paletteColors = messageColorPalette.map(([value]) => value);
function nearestPaletteColor(value: unknown) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return paletteColors[0];
  const rgb = [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const distance = (color: string) => [1, 3, 5].reduce((sum, offset, index) => sum + (parseInt(color.slice(offset, offset + 2), 16) - rgb[index]) ** 2, 0);
  return paletteColors.reduce((best, candidate) => distance(candidate) < distance(best) ? candidate : best, paletteColors[0]);
}
function cosmeticDraft(effectKey: string, appearance: CosmeticAppearance) {
  const draft = { ...cosmeticDefaults[effectKey], ...appearance[effectKey] };
  if (["messageColor", "colorNick", "gradientNick", "gradientText"].includes(effectKey)) {
    for (const key of effectKey.startsWith("gradient") ? ["start", "end"] : ["color"]) draft[key] = nearestPaletteColor(draft[key]);
  }
  return draft;
}


export function CosmeticIcon({ effectKey, size = 19 }: { effectKey?: string | null; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (effectKey) {
    case "boldText": return <svg {...common}><path d="M4 5h8a3 3 0 0 1 0 6H4zM4 11h9a3 3 0 0 1 0 6H4zM4 5v12M17 7h4M17 12h4M17 17h4" /></svg>;
    case "italicText": return <svg {...common}><path d="M9 5h10M5 19h10M14 5l-4 14" /></svg>;
    case "messageColor": return <svg {...common}><path d="M5 5h14v10H9l-4 4V5z" /><path d="M9 9h6M9 12h4" /></svg>;
    case "colorNick": return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.4 6.4M12 12l-7 5" /></svg>;
    case "gradientNick":
    case "gradientText": return <svg {...common}><path d="m4 19 7-15 7 15M6.5 14h9" /><path d="M19 5h2M19 9h2M19 13h2" /></svg>;
    case "pictureNick": return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m5 18 5-5 3 3 3-4 3 6" /></svg>;
    case "avatarFrame": return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="5" /><path d="m12 1 1.5 3M12 23l-1.5-3" /></svg>;
    case "profileCover": return <svg {...common}><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m4 17 5-5 3 3 4-5 4 7" /><circle cx="7" cy="8" r="1" /></svg>;
    case "customStatus": return <svg {...common}><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8 9h8M8 12h5" /></svg>;
    case "vip": return <Crown size={size} aria-hidden />;
    default: return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12h8M12 8v8" /></svg>;
  }
}

export function CosmeticProductPlaceholder({ effectKey, emoji }: { effectKey?: string | null; emoji: string }) {
  return <span className="cosmetic-product-placeholder" aria-hidden>{effectKey ? <CosmeticIcon effectKey={effectKey} size={52} /> : <span>{emoji}</span>}</span>;
}

function pictureBackground(preset: string | boolean | undefined, avatarUrl?: string | null) {
  if (preset === "avatar" && avatarUrl) return "url(" + JSON.stringify(avatarUrl) + ")";
  if (preset === "sunset") return "linear-gradient(125deg,#f6d476 8%,#e87665 38%,#594b9f 75%,#223a6f)";
  if (preset === "marble") return "repeating-linear-gradient(135deg,#284b43 0 6px,#b2c8b0 7px 10px,#e8dab2 11px 17px)";
  return "linear-gradient(125deg,#234d37 8%,#7ba245 30%,#d6b968 53%,#367157 78%,#18382e)";
}

export function StyledName({ name, appearance, avatarUrl, className, showVipCrown = true }: { name: string; appearance?: CosmeticAppearance; avatarUrl?: string | null; className?: string; showVipCrown?: boolean }) {
  const picture = appearance?.pictureNick?.enabled !== false && appearance?.pictureNick;
  const gradient = appearance?.gradientNick?.enabled !== false && appearance?.gradientNick;
  const colored = appearance?.colorNick?.enabled !== false && appearance?.colorNick;
  const messageColor = appearance?.messageColor?.enabled !== false ? appearance?.messageColor?.color : undefined;
  const backgroundImage = picture ? pictureBackground(picture.preset, avatarUrl) : gradient ? "linear-gradient(90deg," + gradient.start + "," + gradient.end + ")" : undefined;
  const style: CSSProperties = { color: !backgroundImage ? (colored ? String(colored.color) : typeof messageColor === "string" ? messageColor : undefined) : undefined, backgroundImage };
  return <span className={"styled-name" + (backgroundImage ? " image-fill" : "") + (className ? " " + className : "")} style={style}>{name}{showVipCrown && appearance?.vip?.enabled !== false && appearance?.vip && <Crown className="styled-name-vip" size={12} aria-label="VIP" />}</span>;
}

export function StyledMessageText({ appearance, children }: { appearance?: CosmeticAppearance; children: ReactNode }) {
  const effect = appearance?.gradientText;
  const gradient = effect && effect.enabled !== false;
  const bold = appearance?.boldText && appearance.boldText.enabled !== false;
  const italic = appearance?.italicText && appearance.italicText.enabled !== false;
  const messageColor = appearance?.messageColor?.enabled !== false ? appearance?.messageColor?.color : undefined;
  if (!gradient && !bold && !italic && !messageColor) return <>{children}</>;
  return <span className={gradient ? "styled-message-text" : undefined} style={{ backgroundImage: gradient ? "linear-gradient(90deg," + effect.start + "," + effect.end + ")" : undefined, color: !gradient && typeof messageColor === "string" ? messageColor : undefined, fontWeight: bold ? 600 : undefined, fontStyle: italic ? "italic" : undefined }}>{children}</span>;
}

export function CosmeticSettingsDialog({ effectKey, appearance, onSaved, onClose }: { effectKey: string; appearance: CosmeticAppearance; onSaved: (next: CosmeticAppearance) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => cosmeticDraft(effectKey, appearance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setDraft(cosmeticDraft(effectKey, appearance)), [effectKey, appearance]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const next = await saveCosmetic(effectKey, draft); onSaved(next); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить оформление"); }
    finally { setBusy(false); }
  }
  const update = (key: string, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  const paletteInput = (key: string, label: string) => <fieldset className="cosmetic-palette-field"><legend>{label}</legend><div className="cosmetic-palette-swatches">{messageColorPalette.map(([value, name]) => <button type="button" key={value} className={draft[key] === value ? "selected" : ""} style={{ backgroundColor: value }} title={name} aria-label={label + ": " + name} aria-pressed={draft[key] === value} onClick={() => update(key, value)} />)}</div><small>{messageColorPalette.find(([value]) => value === draft[key])?.[1] ?? "Выберите цвет"}</small></fieldset>;
  const selectInput = (key: string, label: string, options: ReadonlyArray<readonly [string, string]>) => <label>{label}<StyledSelect value={String(draft[key] ?? options[0][0])} onChange={(event) => update(key, event.target.value)}>{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</StyledSelect></label>;
  const isGradient = effectKey === "gradientNick" || effectKey === "gradientText";
  const previewStyle: CSSProperties = isGradient ? { backgroundImage: "linear-gradient(90deg," + draft.start + "," + draft.end + ")" } : { color: String(draft.color ?? paletteColors[0]) };
  return <div className="cosmetic-settings-backdrop" onMouseDown={onClose}><section className="cosmetic-settings-dialog" role="dialog" aria-modal="true" aria-label={"Настроить " + cosmeticLabels[effectKey]} onMouseDown={(event) => event.stopPropagation()}>
    <header><span className="cosmetic-settings-icon"><CosmeticIcon effectKey={effectKey} size={25} /></span><div><small>НАСТРОЙКА ОФОРМЛЕНИЯ</small><h3>{cosmeticLabels[effectKey]}</h3></div><button type="button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={(event) => void submit(event)}>
      {(effectKey === "messageColor" || effectKey === "colorNick") && paletteInput("color", effectKey === "messageColor" ? "Цвет сообщений и ника" : "Цвет ника")}
      {isGradient && <div className="cosmetic-palette-pair">{paletteInput("start", "Первый цвет")}{paletteInput("end", "Второй цвет")}</div>}
      {["messageColor", "colorNick", "gradientNick", "gradientText"].includes(effectKey) && <div className="cosmetic-color-preview"><span className={isGradient ? "gradient" : ""} style={previewStyle}>Так будет выглядеть текст</span></div>}
      {effectKey === "pictureNick" && selectInput("preset", "Изображение внутри ника", [["avatar", "Мой аватар"], ["botanical", "Листва"], ["sunset", "Закат"], ["marble", "Мрамор"]])}
      {effectKey === "avatarFrame" && selectInput("theme", "Рамка", [["lime", "Лайм"], ["gold", "Золото"], ["silver", "Серебро"]])}
      {effectKey === "profileCover" && selectInput("theme", "Обложка", [["meadow", "Луга"], ["sunset", "Закат"], ["night", "Ночь"]])}
      {effectKey === "customStatus" && <label>Текст статуса<input value={String(draft.text ?? "")} maxLength={48} onChange={(event) => update("text", event.target.value)} placeholder="Что хочется сказать о себе?" /></label>}
      <label className="cosmetic-enabled"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => update("enabled", event.target.checked)} />Показывать оформление</label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <footer><button type="button" className="action-button secondary" onClick={onClose}>Позже</button><button type="submit" className="action-button" disabled={busy}><Save size={15} />{busy ? "Сохраняем…" : "Сохранить"}</button></footer>
    </form>
  </section></div>;
}

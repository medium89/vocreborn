import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const COSMETIC_KEYS = ["messageColor", "boldText", "italicText", "colorNick", "gradientNick", "gradientText", "pictureNick", "avatarFrame", "profileCover", "customStatus", "vip"] as const;
export type CosmeticKey = typeof COSMETIC_KEYS[number];
export type CosmeticSettings = Record<string, string | boolean>;
export type CosmeticAppearance = Record<string, CosmeticSettings>;
const LEGACY_MESSAGE_COLOR_PALETTE = [
  "#2d644a", "#286284", "#65518b", "#874d47", "#76591e", "#3a615d", "#5c4d41", "#3f527a",
  "#6b2019", "#6b4019", "#6b5e19", "#196b2e", "#196b65", "#19496b", "#19206b", "#57196b",
  "#732821", "#734721", "#736521", "#217336", "#21736c", "#215173", "#212873", "#5e2173",
  "#76332d", "#764f2d", "#766a2d", "#2d763f", "#2d7670", "#2d5876", "#2d3376", "#642d76",
  "#751d15", "#754215", "#756515", "#15752d", "#15756d", "#154d75", "#151d75", "#5d1575",
  "#78241c", "#78471c", "#78691c", "#1c7833", "#1c7870", "#1c5278", "#1c2478", "#611c78",
  "#5d2c28", "#5d4128", "#5d5428", "#285d35", "#285d58", "#28475d", "#282c5d", "#50285d",
  "#732d26", "#734a26", "#736626", "#267339", "#26736c", "#265373", "#262d73", "#602673",
  "#4f2926", "#4f3926", "#4f4726", "#264f31", "#264f4b", "#263d4f", "#26294f", "#44264f",
  "#59120d", "#59300d", "#594a0d", "#0d5921", "#0d5952", "#0d3859", "#0d1259", "#450d59",
  "#84342e", "#84562e", "#7e6e2c", "#2c7e42", "#2c7e77", "#2e5f84", "#2e3484", "#6d2e84",
  "#8b1209", "#8b4609", "#856c08", "#077f28", "#077f73", "#09538b", "#09128b", "#68098b",
  "#624341", "#625141", "#625b41", "#41624a",
] as const;
export const MESSAGE_COLOR_PALETTE = [
  "#ed0707", "#a96705", "#678004", "#1f8904", "#04893a", "#048484", "#156ff8", "#7a59fa", "#c307f2", "#e2078b",
  "#c15729", "#82781c", "#50841c", "#1d8928", "#1d8667", "#237fa7", "#5f6bdd", "#9855db", "#cc2bbc", "#d53b6a",
  "#d50707", "#975d05", "#5c7204", "#1c7b04", "#047b34", "#047676", "#0761e8", "#6a47f9", "#b007da", "#cb067d",
  "#ad4d25", "#756b19", "#487619", "#1a7a24", "#1a785c", "#207195", "#4f5cda", "#8c42d7", "#b727a9", "#c62a59",
  "#c00606", "#875304", "#536603", "#196e03", "#036e2e", "#036a6a", "#0657cf", "#5a33f9", "#9e06c4", "#b70670",
  "#9b4521", "#686016", "#406916", "#176d20", "#176b52", "#1c6585", "#3f4ed6", "#812fd3", "#a42398", "#b12650",
  "#ab0505", "#784904", "#495a03", "#166103", "#036129", "#035d5d", "#064db8", "#4619f8", "#8c05ae", "#a30564",
  "#893d1d", "#5c5413", "#395d14", "#15611c", "#2d644a", "#195a75", "#2e3ed3", "#7228bd", "#921f86", "#9e2147",
  "#930505", "#663f03", "#3e4d02", "#135303", "#035323", "#025050", "#05429e", "#3307e3", "#790597", "#8c0456",
  "#753519", "#4f4811", "#305011", "#125318", "#11513e", "#154d65", "#2735b7", "#6222a3", "#7d1b74", "#871d3d",
] as const;

export const SELECTABLE_COLOR_PALETTE = [
  "#d62828", "#ed7d00", "#d7b600", "#70a900", "#008750", "#0096a6", "#2869de", "#8148ca", "#cf2e9e", "#744222",
  "#002673", "#2bd9bc", "#ff66ff", "#730060", "#0000d9", "#66b3ff", "#006073", "#ff6699", "#5300a6", "#d400ff",
  "#a66e00", "#00d900", "#5500ff", "#a62163", "#730013", "#b366ff", "#214da6", "#a60000", "#ff00d4", "#8a00a6",
] as const;

export const COSMETIC_DEFAULTS: Record<CosmeticKey, CosmeticSettings> = {
  messageColor: { enabled: true, color: "#008750" },
  boldText: { enabled: true },
  italicText: { enabled: true },
  colorNick: { enabled: true, color: "#70a900" },
  gradientNick: { enabled: true, start: "#70a900", end: "#0096a6" },
  gradientText: { enabled: true, start: "#70a900", end: "#0096a6" },
  pictureNick: { enabled: true, preset: "avatar" },
  avatarFrame: { enabled: true, theme: "lime" },
  profileCover: { enabled: true, theme: "meadow" },
  customStatus: { enabled: true, text: "" },
  vip: { enabled: true },
};

export function cosmeticAppearance(rows: Array<{ effectKey: string; settings: Prisma.JsonValue }>): CosmeticAppearance {
  return Object.fromEntries(rows.map((row) => [row.effectKey, row.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? row.settings : {}])) as CosmeticAppearance;
}

function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new BadRequestException(label + ": нужен цвет в формате #RRGGBB");
  return value.toLowerCase();
}
function choice(value: unknown, options: string[], label: string): string {
  if (typeof value !== "string" || !options.includes(value)) throw new BadRequestException("Недопустимое значение: " + label);
  return value;
}
function paletteColor(value: unknown, label: string): string {
  const selected = color(value, label);
  if (!(SELECTABLE_COLOR_PALETTE as readonly string[]).includes(selected)) throw new BadRequestException("Выберите цвет из доступной палитры");
  return selected;
}

export function sanitizeCosmeticSettings(key: string, raw: unknown): CosmeticSettings {
  if (!COSMETIC_KEYS.includes(key as CosmeticKey)) throw new BadRequestException("Неизвестное улучшение профиля");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadRequestException("Неверные настройки оформления");
  const input = raw as Record<string, unknown>;
  const enabled = input.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== "boolean") throw new BadRequestException("Неверное значение включения");
  switch (key as CosmeticKey) {
    case "messageColor": return { enabled, color: paletteColor(input.color, "Цвет сообщений и ника") };
    case "colorNick": return { enabled, color: paletteColor(input.color, "Цвет ника") };
    case "gradientNick":
    case "gradientText": return { enabled, start: paletteColor(input.start, "Начальный цвет"), end: paletteColor(input.end, "Конечный цвет") };
    case "pictureNick": return { enabled, preset: choice(input.preset, ["avatar", "botanical", "sunset", "marble"], "изображение ника") };
    case "avatarFrame": return { enabled, theme: choice(input.theme, ["lime", "gold", "silver"], "рамка аватара") };
    case "profileCover": return { enabled, theme: choice(input.theme, ["meadow", "sunset", "night"], "обложка профиля") };
    case "customStatus": {
      const text = typeof input.text === "string" ? input.text.trim().replace(new RegExp("[\\x00-\\x1f\\x7f]", "g"), "") : "";
      if (text.length > 48) throw new BadRequestException("Статус не может быть длиннее 48 символов");
      return { enabled, text };
    }
    default: return { enabled };
  }
}

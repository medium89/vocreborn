import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { AuthenticatedUser } from "../auth/auth.types";

export const DEFAULT_SETTINGS = {
  registrationOpen: true, allowUserRooms: true, maintenance: false,
  maxMessageLength: 1000, slowModeSeconds: 0, allowLinks: true,
  imageMaxMb: 20, audioMaxMb: 8,
  initialCredits: 20, firstMessageReward: 5, firstReplyReward: 3,
  profileCommentReward: 4, photoLikeReward: 2, profilePostLikeReward: 2,
};
export type ChatSettings = typeof DEFAULT_SETTINGS;
const ranges: Partial<Record<keyof ChatSettings, [number, number]>> = {
  maxMessageLength: [10, 1000], slowModeSeconds: [0, 3600], imageMaxMb: [1, 20], audioMaxMb: [1, 8],
  initialCredits: [0, 100000], firstMessageReward: [0, 1000], firstReplyReward: [0, 1000],
  profileCommentReward: [0, 1000], photoLikeReward: [0, 1000], profilePostLikeReward: [0, 1000],
};

@Injectable()
export class ChatSettingsService {
  constructor(private readonly prisma: PrismaService) {}
  async read(database: Pick<PrismaService, "chatSetting"> = this.prisma) {
    const record = await database.chatSetting.findUnique({ where: { id: "main" } });
    return { settings: { ...DEFAULT_SETTINGS, ...(record?.settings as Partial<ChatSettings> ?? {}) }, version: record?.version ?? 0 };
  }
  async save(actor: AuthenticatedUser, patch: Record<string, unknown>, version: number, reason: string) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
    if (!Number.isInteger(version) || version < 0 || !reason?.trim() || reason.trim().length > 500)
      throw new BadRequestException("Укажите версию настроек и причину изменения (до 500 символов)");
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length) throw new BadRequestException("Нет изменений");
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new BadRequestException("Неизвестная настройка: " + key);
      const name = key as keyof ChatSettings, range = ranges[name];
      if (range ? typeof value !== "number" || !Number.isInteger(value) || value < range[0] || value > range[1] : typeof value !== "boolean")
        throw new BadRequestException("Некорректное значение: " + key);
    }
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(284731)`;
      const record = await tx.chatSetting.findUnique({ where: { id: "main" } });
      if ((record?.version ?? 0) !== version) throw new ConflictException("Настройки уже изменены другим администратором. Обновите страницу перед сохранением.");
      const before = { ...DEFAULT_SETTINGS, ...(record?.settings as Partial<ChatSettings> ?? {}) };
      const settings = { ...before, ...patch } as ChatSettings;
      await tx.chatSetting.upsert({ where: { id: "main" }, create: { id: "main", settings, version: 1 }, update: { settings, version: { increment: 1 } } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "CHAT_SETTINGS", details: { before, after: settings, reason: reason.trim() } } });
      return { settings, version: version + 1 };
    });
  }
  async assertMessage(userId: string, body: string) {
    const [{ settings }, user] = await Promise.all([this.read(), this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })]);
    if (settings.maintenance && user?.role === "USER") throw new ForbiddenException("Чат временно на обслуживании. Отправка сообщений приостановлена.");
    if (body.trim().length > settings.maxMessageLength) throw new BadRequestException("Максимальная длина сообщения: " + settings.maxMessageLength);
    if (!settings.allowLinks && /(?:https?:\/\/|www\.)\S+/i.test(body) && user?.role === "USER") throw new ForbiddenException("Ссылки в сообщениях отключены администратором");
    return { ...settings, slowModeSeconds: user?.role === "USER" ? settings.slowModeSeconds : 0 };
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType, Prisma } from "@prisma/client";
import { assertNotInChaos } from "../moderation/chaos.guard";
import { COSMETIC_DEFAULTS, cosmeticAppearance, sanitizeCosmeticSettings, type CosmeticKey } from "./cosmetics";

@Injectable()
export class GiftsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}
  async catalog() {
    const gifts = await this.prisma.giftCatalog.findMany({ where: { active: true, deletedAt: null, category: { active: true, deletedAt: null } }, orderBy: [{ position: "asc" }, { name: "asc" }] });
    return gifts.map((gift) => ({ id: gift.id, name: gift.name, description: gift.description, emoji: gift.emoji, price: gift.price, categoryId: gift.categoryId, kind: gift.kind, effectKey: gift.effectKey, imageUrl: gift.imageKey }));
  }
  async balance(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rating: true, credits: true } });
    return user;
  }
  async inventory(userId: string) {
    const items = await this.prisma.giftInventory.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" }, take: 100, include: { gift: true, sender: { select: { id: true, displayName: true } } } });
    return items.map((item) => ({ id: item.id, createdAt: item.createdAt.toISOString(), gift: { id: item.gift.id, name: item.giftName, description: item.giftDescription, emoji: item.giftEmoji, price: item.giftPrice, categoryId: item.gift.categoryId, imageUrl: item.gift.imageKey }, sender: item.sender ? { id: item.sender.id, displayName: item.sender.displayName } : null, message: item.message }));
  }
  async myCosmetics(userId: string) {
    const rows = await this.prisma.userCosmetic.findMany({ where: { userId } });
    return cosmeticAppearance(rows);
  }
  async buyCosmetic(productId: string, userId: string) {
    await assertNotInChaos(this.prisma, userId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.giftCatalog.findFirst({ where: { id: productId, kind: "cosmetic", active: true, deletedAt: null, category: { active: true, deletedAt: null } } });
        if (!product?.effectKey || !(product.effectKey in COSMETIC_DEFAULTS)) throw new NotFoundException("Улучшение не найдено");
        const owned = await tx.userCosmetic.findUnique({ where: { userId_effectKey: { userId, effectKey: product.effectKey } } });
        if (owned) throw new ConflictException("Это улучшение уже куплено");
        const changed = await tx.user.updateMany({ where: { id: userId, credits: { gte: product.price } }, data: { credits: { decrement: product.price } } });
        if (!changed.count) throw new BadRequestException("Недостаточно кредитов");
        await tx.userCosmetic.create({ data: { userId, effectKey: product.effectKey, settings: COSMETIC_DEFAULTS[product.effectKey as CosmeticKey] } });
        const balance = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true, rating: true } });
        await tx.economyEntry.create({ data: { userId, type: "COSMETIC_PURCHASE", creditsDelta: -product.price, balanceAfter: balance.credits, giftId: product.id } });
        const cosmetics = cosmeticAppearance(await tx.userCosmetic.findMany({ where: { userId } }));
        return { balance, cosmetics, effectKey: product.effectKey };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Это улучшение уже куплено");
      throw error;
    }
  }
  async updateCosmetic(userId: string, effectKey: string, settings: unknown) {
    const normalized = sanitizeCosmeticSettings(effectKey, settings);
    const owned = await this.prisma.userCosmetic.findUnique({ where: { userId_effectKey: { userId, effectKey } } });
    if (!owned && effectKey === "messageColor") await this.prisma.userCosmetic.create({ data: { userId, effectKey, settings: normalized } });
    else if (!owned) throw new BadRequestException("Сначала купите это улучшение в магазине");
    else await this.prisma.userCosmetic.update({ where: { userId_effectKey: { userId, effectKey } }, data: { settings: normalized } });
    return this.myCosmetics(userId);
  }
  async send(giftId: string, sender: AuthenticatedUser, recipientId?: string, message?: string) {
    await assertNotInChaos(this.prisma, sender.id);
    const result = await this.prisma.$transaction(async (tx) => {
      const [gift, recipient, current] = await Promise.all([
        tx.giftCatalog.findFirst({ where: { id: giftId, active: true, deletedAt: null, category: { active: true, deletedAt: null } } }),
        tx.user.findFirst({ where: { id: recipientId ?? sender.id, deletedAt: null } }),
        tx.user.findUniqueOrThrow({ where: { id: sender.id }, select: { credits: true } }),
      ]);
      if (!gift) throw new NotFoundException("Товар не найден");
      if (!recipient) throw new NotFoundException("Получатель не найден");
      if (current.credits < gift.price) throw new BadRequestException("Недостаточно кредитов для этого подарка");

      if (gift.kind === "cosmetic") {
        if (!gift.effectKey) throw new BadRequestException("Улучшение настроено неверно");
        const owned = await tx.userCosmetic.findUnique({ where: { userId_effectKey: { userId: recipient.id, effectKey: gift.effectKey } } });
        if (owned) throw new ConflictException("У получателя уже есть это улучшение");
        await tx.userCosmetic.create({ data: { userId: recipient.id, effectKey: gift.effectKey, settings: COSMETIC_DEFAULTS[gift.effectKey as CosmeticKey] } });
      }
      const updated = await tx.user.update({ where: { id: sender.id }, data: { credits: { decrement: gift.price } }, select: { credits: true, rating: true } });
      const item = await tx.giftInventory.create({ data: { giftId: gift.id, senderId: sender.id, recipientId: recipient.id, message: message?.trim() || null, giftName: gift.name, giftDescription: gift.description, giftEmoji: gift.emoji, giftPrice: gift.price } });
      await tx.economyEntry.create({ data: { userId: sender.id, type: "GIFT_PURCHASE", creditsDelta: -gift.price, balanceAfter: updated.credits, giftId: gift.id } });
      return { id: item.id, recipient: { id: recipient.id, displayName: recipient.displayName }, balance: updated };
    });
    if (recipientId && recipientId !== sender.id) await this.notifications.createEvent({ userId: result.recipient.id, actorId: sender.id, type: NotificationType.GIFT, giftInventoryId: result.id });
    return result;
  }
}

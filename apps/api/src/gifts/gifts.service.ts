import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "@prisma/client";

@Injectable()
export class GiftsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}
  async catalog() {
    const gifts = await this.prisma.giftCatalog.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] });
    return gifts.map((gift) => ({ id: gift.id, name: gift.name, description: gift.description, emoji: gift.emoji, price: gift.price }));
  }
  async balance(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { rating: true, credits: true } });
    return user;
  }
  async inventory(userId: string) {
    const items = await this.prisma.giftInventory.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" }, take: 100, include: { gift: true, sender: { select: { id: true, displayName: true } } } });
    return items.map((item) => ({ id: item.id, createdAt: item.createdAt.toISOString(), gift: { id: item.gift.id, name: item.gift.name, description: item.gift.description, emoji: item.gift.emoji, price: item.gift.price }, sender: item.sender ? { id: item.sender.id, displayName: item.sender.displayName } : null, message: item.message }));
  }
  async send(giftId: string, sender: AuthenticatedUser, recipientId?: string, message?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const [gift, recipient, current] = await Promise.all([
        tx.giftCatalog.findFirst({ where: { id: giftId, active: true } }),
        tx.user.findFirst({ where: { id: recipientId ?? sender.id, deletedAt: null } }),
        tx.user.findUniqueOrThrow({ where: { id: sender.id }, select: { credits: true } }),
      ]);
      if (!gift) throw new NotFoundException("Подарок не найден");
      if (!recipient) throw new NotFoundException("Получатель не найден");
      if (current.credits < gift.price) throw new BadRequestException("Недостаточно кредитов для этого подарка");
      const updated = await tx.user.update({ where: { id: sender.id }, data: { credits: { decrement: gift.price } }, select: { credits: true, rating: true } });
      const item = await tx.giftInventory.create({ data: { giftId: gift.id, senderId: sender.id, recipientId: recipient.id, message: message?.trim() || null } });
      await tx.economyEntry.create({ data: { userId: sender.id, type: "GIFT_PURCHASE", creditsDelta: -gift.price, balanceAfter: updated.credits, giftId: gift.id } });
      return { id: item.id, recipient: { id: recipient.id, displayName: recipient.displayName }, balance: updated };
    });
    if (recipientId && recipientId !== sender.id) await this.notifications.createEvent({ userId: result.recipient.id, actorId: sender.id, type: NotificationType.GIFT, giftInventoryId: result.id });
    return result;
  }
}

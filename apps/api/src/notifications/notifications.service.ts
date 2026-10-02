import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { NotificationType, type Message, type Prisma, type ReactionType } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { PushService } from "./push.service";
type ChangeListener = (userId: string) => void;

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly listeners = new Set<ChangeListener>();
  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}
  subscribe(listener: ChangeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onModuleDestroy() { this.listeners.clear(); }

  private async loadItems(where: Prisma.NotificationWhereInput, take: number, skip = 0) {
    return this.prisma.notification.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, skip,
      include: {
        actor: { select: { id: true, displayName: true, avatarKey: true } },
        message: { select: { id: true, body: true, roomId: true, authorId: true, recipientId: true } },
        profilePost: { select: { id: true, body: true, profileUserId: true } },
        giftInventory: { include: { gift: true } },
        photo: { select: { id: true, thumbnailKey: true, album: { select: { userId: true } } } },
      },
    });
  }

  private toApi(item: Awaited<ReturnType<NotificationsService["loadItems"]>>[number], userId: string) {
    return {
      id: item.id, type: item.type.toLowerCase(),
      actor: {
        id: item.actor.id, name: item.actor.displayName,
        avatar: item.actor.avatarKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + item.actor.avatarKey : item.actor.displayName[0]?.toUpperCase() ?? "?",
      },
      messageId: item.messageId, profilePostId: item.profilePostId, giftInventoryId: item.giftInventoryId, photoId: item.photoId,
      roomId: item.message?.roomId ?? null,
      peerId: item.message?.roomId ? null : item.message ? (item.message.authorId === userId ? item.message.recipientId : item.message.authorId) : null,
      preview: item.message?.body ?? item.profilePost?.body ?? item.giftInventory?.message ?? item.giftInventory?.gift.name ?? (item.metadata as { preview?: string } | null)?.preview ?? "",
      photoThumbnailUrl: item.photo ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + item.photo.thumbnailKey : null,
      reactionType: item.reactionType?.toLowerCase() ?? null,
      readAt: item.readAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(),
    };
  }

  async list(userId: string) {
    const [unread, items] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.loadItems({ userId }, 50),
    ]);
    return { unread, items: items.map((item) => this.toApi(item, userId)) };
  }

  async history(userId: string, rawPage?: string, rawTypes?: string) {
    const requestedPage = Number(rawPage);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const allowed = new Set<string>(Object.values(NotificationType));
    const types = rawTypes === undefined ? undefined : [...new Set(rawTypes.split(",").map((type) => type.trim().toUpperCase()).filter((type) => allowed.has(type)))] as NotificationType[];
    const where: Prisma.NotificationWhereInput = { userId, ...(types ? { type: { in: types } } : {}) };
    const pageSize = 20;
    const total = await this.prisma.notification.count({ where });
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, pages);
    const items = await this.loadItems(where, pageSize, (currentPage - 1) * pageSize);
    return { items: items.map((item) => this.toApi(item, userId)), total, page: currentPage, pages, pageSize };
  }

  async clearAll(userId: string) {
    const result = await this.prisma.notification.deleteMany({ where: { userId } });
    if (result.count) this.emit(userId);
    return { deleted: result.count };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (result.count) this.emit(userId);
    return { deleted: result.count };
  }

  async createReply(actorId: string, replyMessageId: string, replyToId?: string) {
    if (!replyToId) return;
    const target = await this.prisma.message.findFirst({ where: { id: replyToId, deletedAt: null }, select: { authorId: true, roomId: true } });
    if (!target?.authorId || !target.roomId) return;
    await this.createEvent({ userId: target.authorId, actorId, type: NotificationType.REPLY, messageId: replyMessageId });
  }

  async createMentions(actorId: string, messageId: string, body: string) {
    const usernames = new Set<string>();
    for (const match of body.matchAll(/(?:^|[^a-z0-9_])@([a-z0-9_]{3,32})(?![a-z0-9_])/gi)) {
      if (match[1]) usernames.add(match[1].toLowerCase());
    }
    if (usernames.size === 0) return;

    const recipients = await this.prisma.user.findMany({
      where: { username: { in: [...usernames] }, id: { not: actorId }, deletedAt: null },
      select: { id: true },
    });
    if (recipients.length === 0) return;

    await Promise.all(recipients.map(({ id: userId }) => this.createEvent({ userId, actorId, type: NotificationType.MENTION, messageId })));
  }

  async syncReaction(actorId: string, message: Pick<Message, "id" | "authorId">, selected: ReactionType | null) {
    const userId = message.authorId; if (!userId || userId === actorId) return;
    if (!selected) { const deleted = await this.prisma.notification.deleteMany({ where: { userId, actorId, messageId: message.id, type: NotificationType.REACTION } }); if (deleted.count) this.emit(userId); return; }
    await this.createEvent({ userId, actorId, type: NotificationType.REACTION, messageId: message.id, metadata: { reactionType: selected } });
  }
  async createEvent(input: { userId: string; actorId: string; type: NotificationType; messageId?: string; profilePostId?: string; giftInventoryId?: string; photoId?: string; metadata?: Record<string, unknown>; allowSelf?: boolean }) {
    if (input.userId === input.actorId && !input.allowSelf) return;
    const where = { userId: input.userId, actorId: input.actorId, type: input.type, messageId: input.messageId ?? null, profilePostId: input.profilePostId ?? null, giftInventoryId: input.giftInventoryId ?? null, photoId: input.photoId ?? null };
    const existing = await this.prisma.notification.findFirst({ where });
    if (existing) await this.prisma.notification.update({ where: { id: existing.id }, data: { readAt: null, createdAt: new Date(), metadata: input.metadata as any, reactionType: (input.metadata as any)?.reactionType ?? null } });
    else await this.prisma.notification.create({ data: { ...where, metadata: input.metadata as any, reactionType: (input.metadata as any)?.reactionType ?? null } });
    this.emit(input.userId);
    if (input.type === NotificationType.MENTION) {
      const actor = await this.prisma.user.findUnique({ where: { id: input.actorId }, select: { displayName: true } });
      await this.push.mention(input.userId, actor?.displayName ?? "Участник", "Вас упомянули в сообщении");
    }
  }

  async createProfilePost(actorId: string, postId: string, profileUserId: string, parentAuthorId?: string) {
    const recipients = new Set([profileUserId, ...(parentAuthorId ? [parentAuthorId] : [])]);
    await Promise.all([...recipients].filter((id) => id !== actorId).map((userId) => this.createEvent({ userId, actorId, type: parentAuthorId ? NotificationType.PROFILE_POST_REPLY : NotificationType.PROFILE_POST, profilePostId: postId })));
  }

  private emit(userId: string) { for (const listener of this.listeners) listener(userId); }
}

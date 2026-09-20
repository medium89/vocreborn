import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { NotificationType, type Message, type ReactionType } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
type ChangeListener = (userId: string) => void;

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly listeners = new Set<ChangeListener>();
  constructor(private readonly prisma: PrismaService) {}
  subscribe(listener: ChangeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onModuleDestroy() { this.listeners.clear(); }

  async list(userId: string) {
    const [unread, items] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({
        where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
        include: {
          actor: { select: { id: true, displayName: true, avatarKey: true } },
          message: { select: { id: true, body: true, roomId: true, authorId: true, recipientId: true } },
          profilePost: { select: { id: true, body: true, profileUserId: true } },
          giftInventory: { include: { gift: true } },
          photo: { select: { id: true, thumbnailKey: true, album: { select: { userId: true } } } },
        },
      }),
    ]);
    return { unread, items: items.map((item) => ({
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
    })) };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
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
  async createEvent(input: { userId: string; actorId: string; type: NotificationType; messageId?: string; profilePostId?: string; giftInventoryId?: string; photoId?: string; metadata?: Record<string, unknown> }) {
    if (input.userId === input.actorId) return;
    const where = { userId: input.userId, actorId: input.actorId, type: input.type, messageId: input.messageId ?? null, profilePostId: input.profilePostId ?? null, giftInventoryId: input.giftInventoryId ?? null, photoId: input.photoId ?? null };
    const existing = await this.prisma.notification.findFirst({ where });
    if (existing) await this.prisma.notification.update({ where: { id: existing.id }, data: { readAt: null, createdAt: new Date(), metadata: input.metadata as any, reactionType: (input.metadata as any)?.reactionType ?? null } });
    else await this.prisma.notification.create({ data: { ...where, metadata: input.metadata as any, reactionType: (input.metadata as any)?.reactionType ?? null } });
    this.emit(input.userId);
  }

  async createProfilePost(actorId: string, postId: string, profileUserId: string, parentAuthorId?: string) {
    const recipients = new Set([profileUserId, ...(parentAuthorId ? [parentAuthorId] : [])]);
    await Promise.all([...recipients].filter((id) => id !== actorId).map((userId) => this.createEvent({ userId, actorId, type: parentAuthorId ? NotificationType.PROFILE_POST_REPLY : NotificationType.PROFILE_POST, profilePostId: postId })));
  }

  private emit(userId: string) { for (const listener of this.listeners) listener(userId); }
}

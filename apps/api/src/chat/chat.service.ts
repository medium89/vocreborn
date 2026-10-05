import { ChatSettingsService } from "../settings/chat-settings.service";
import { assertNotInChaos } from "../moderation/chaos.guard";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EconomyEntryType, Prisma, ReactionType, type Attachment, type Message, type MessageReaction, type Room } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { AttachmentsService } from "../attachments/attachments.service";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PushService } from "../notifications/push.service";
import { EconomyService } from "../gifts/economy.service";
import { cosmeticAppearance } from "../gifts/cosmetics";
const MAX_ROOM_COVER_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ROOM_COVER_BYTES = 2 * 1024 * 1024;
type RoomCoverFile = { buffer: Buffer; mimetype: string; size: number };

const chatTimeFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
function formatChatTime(value: Date) { return chatTimeFormatter.format(value); }

function normalizeGifUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/^(?:media\d*|i)\.giphy\.com$/i.test(url.hostname)) throw new Error("host");
    return url.toString();
  } catch { throw new BadRequestException("Некорректный GIF"); }
}

function hasValidRoomCoverSignature(file: RoomCoverFile) {
  const png = file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const webp = file.buffer.subarray(0, 4).toString("ascii") === "RIFF" && file.buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return (file.mimetype === "image/png" && png) || (file.mimetype === "image/jpeg" && jpeg) || (file.mimetype === "image/webp" && webp);
}

import type { ApiMessage, ApiPerson, ApiReactionType, ApiRoom, DirectConversation, ReactionUpdate, RoomSnapshot } from "./chat.types";

@Injectable()
export class ChatService {
  private readonly messageListeners = new Set<(event: {
    roomId?: string; recipientId?: string; authorId: string; requestId?: string; message: ApiMessage;
  }) => void>();

  subscribeMessages(listener: (event: {
    roomId?: string; recipientId?: string; authorId: string; requestId?: string; message: ApiMessage;
  }) => void) {
    this.messageListeners.add(listener);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly economy: EconomyService,
    private readonly settings: ChatSettingsService,
  ) {}

  async listRooms(): Promise<ApiRoom[]> {
    const rooms = await this.prisma.room.findMany({ orderBy: { position: "asc" } });
    return Promise.all(rooms.map((room) => this.toApiRoom(room)));
  }

  async createRoom(userId: string, input: { name: string; description?: string; tone?: string; coverEmoji?: string; rules?: string; visibility?: string; isVideoRoom?: boolean }) {
    const [{ settings }, actor] = await Promise.all([this.settings.read(), this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })]);
    if (input.isVideoRoom && actor?.role !== "ADMIN") throw new ForbiddenException("Видеокомнату может создать только администратор");
    if (actor?.role !== "ADMIN" && (!settings.allowUserRooms || settings.maintenance)) throw new ForbiddenException("Создание комнат отключено администратором");
    const position = await this.prisma.room.count();
    const room = await this.prisma.room.create({
      data: {
        id: "room-" + randomUUID().slice(0, 12),
        name: input.name,
        description: input.description ?? "",
        tone: input.tone ?? "lime",
        coverEmoji: input.coverEmoji ?? "✦",
        rules: input.rules ?? "",
        visibility: input.visibility === "private" ? "PRIVATE" : "PUBLIC",
        isVideoRoom: Boolean(input.isVideoRoom),
        position,
        createdById: userId,
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    return this.toApiRoom(room);
  }

  async updateRoom(roomId: string, userId: string, role: "user" | "moderator" | "admin", input: { name?: string; description?: string; tone?: string; coverEmoji?: string; rules?: string; visibility?: string; isVideoRoom?: boolean }) {
    const room = await this.assertRoom(roomId);
    if (input.isVideoRoom !== undefined && role !== "admin") throw new ForbiddenException("Видеокомнату может создать или изменить только администратор");
    if (role !== "admin") {
      const membership = await this.prisma.roomMembership.findUnique({ where: { userId_roomId: { userId, roomId } } });
      if (membership?.role !== "OWNER") throw new ForbiddenException("Изменять комнату может только владелец или администратор");
    }
    const updated = await this.prisma.room.update({
      where: { id: room.id },
      data: { ...input, visibility: input.visibility === undefined ? undefined : input.visibility === "private" ? "PRIVATE" : "PUBLIC" },
    });
    return this.toApiRoom(updated);
  }

  async deleteRoom(roomId: string, userId: string, role: "user" | "moderator" | "admin") {
    if (roomId === "main") throw new BadRequestException("Главную комнату нельзя удалить");
    const room = await this.assertRoom(roomId);
    if (role !== "admin" && room.createdById !== userId) throw new ForbiddenException("Удалять комнату может только её владелец или администратор");
    await this.prisma.room.delete({ where: { id: room.id } });
    await Promise.all([this.deleteRoomCover(room.coverKey), this.deleteRoomCover(room.coverThumbKey)]);
    return { roomId, deleted: true };
  }
  async saveRoomCover(roomId: string, userId: string, role: "user" | "moderator" | "admin", file?: RoomCoverFile) {
    const room = await this.assertRoom(roomId);
   if (role !== "admin") {
      const membership = await this.prisma.roomMembership.findUnique({ where: { userId_roomId: { userId, roomId } } });
      if (membership?.role !== "OWNER") throw new ForbiddenException("Изменять обложку может только владелец или администратор");
    }
    if (!file) throw new BadRequestException("Файл обложки не передан");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype) || !hasValidRoomCoverSignature(file)) throw new BadRequestException("Допустимы корректные PNG, JPEG и WebP");
    if (file.size > MAX_ROOM_COVER_UPLOAD_BYTES) throw new BadRequestException("Исходное изображение должно быть не больше 10 МБ");

    let cover: Buffer | undefined;
    try {
      for (const width of [1600, 1280, 1024]) {
        for (const quality of [84, 72, 60, 48]) {
          const encoded = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(width, 900, { fit: "inside", withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer();
          if (encoded.length <= MAX_ROOM_COVER_BYTES) { cover = encoded; break; }
        }
        if (cover) break;
      }
    } catch { throw new BadRequestException("Не удалось обработать обложку"); }
    if (!cover) throw new BadRequestException("Не удалось сжать обложку до 2 МБ");
    const thumbnail = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(320, 180, { fit: "cover", position: "centre" }).webp({ quality: 72, effort: 4 }).toBuffer().catch(() => { throw new BadRequestException("Не удалось создать превью обложки"); });
    const directory = join(process.cwd(), "uploads", "room-covers");
    const id = randomUUID();
    const filename = id + ".webp";
    const thumbFilename = id + "-preview.webp";
    await mkdir(directory, { recursive: true });
    await Promise.all([writeFile(join(directory, filename), cover), writeFile(join(directory, thumbFilename), thumbnail)]);
    try {
      const updated = await this.prisma.room.update({ where: { id: room.id }, data: { coverKey: "/uploads/room-covers/" + filename, coverThumbKey: "/uploads/room-covers/" + thumbFilename } });
      await Promise.all([this.deleteRoomCover(room.coverKey), this.deleteRoomCover(room.coverThumbKey)]);
      return this.toApiRoom(updated);
    } catch (error) {
      await Promise.all([unlink(join(directory, filename)).catch(() => undefined), unlink(join(directory, thumbFilename)).catch(() => undefined)]);
      throw error;
    }
  }

  async joinMembership(userId: string, roomId: string) {
    await this.assertRoom(roomId);
    await this.prisma.roomMembership.upsert({
      where: { userId_roomId: { userId, roomId } },
      create: { userId, roomId },
      update: {},
    });
    return { roomId, joined: true };
  }

  async leaveMembership(userId: string, roomId: string) {
    const membership = await this.prisma.roomMembership.findUnique({ where: { userId_roomId: { userId, roomId } } });
    if (membership?.role === "OWNER") throw new BadRequestException("Владелец не может покинуть свою комнату");
    await this.prisma.roomMembership.deleteMany({ where: { userId, roomId } });
    return { roomId, joined: false };
  }

  async getMessagePage(roomId: string, cursor?: string, currentUserId?: string) {
    await this.assertRoom(roomId);
    const messages = await this.prisma.message.findMany({
      where: { roomId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } },
    });
    const hasMore = messages.length > 50;
    const page = messages.slice(0, 50);
    return {
      items: [...page].reverse().map((message) => this.toApiMessage(message, currentUserId)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async getRoomResources(roomId: string, currentUserId?: string) {
    await this.assertRoom(roomId);
    const messages = await this.prisma.message.findMany({
      where: { roomId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { attachments: true },
    });
    const source = (message: typeof messages[number]) => ({ messageId: message.id, author: message.authorName, createdAt: message.createdAt.toISOString() });
    const media = messages.flatMap((message) => message.attachments.map((attachment) => ({ ...source(message), attachment: this.attachments.toApi(attachment, message.roomId) })));
    const links = messages.flatMap((message) => Array.from(message.body.matchAll(/https?:\/\/[^\s<>"]+/g)).map((match) => ({ ...source(message), url: match[0] })));
    return { media, files: media.filter((item) => item.attachment.kind === "audio"), links };
  }

  async getDirectResources(userId: string) {
    const messages = await this.prisma.message.findMany({
      where: { roomId: null, deletedAt: null, OR: [{ authorId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { attachments: true },
    });
    const source = (message: typeof messages[number]) => ({ messageId: message.id, author: message.authorName, createdAt: message.createdAt.toISOString() });
    const media = messages.flatMap((message) => message.attachments.map((attachment) => ({ ...source(message), attachment: this.attachments.toApi(attachment, message.roomId) })));
    const links = messages.flatMap((message) => Array.from(message.body.matchAll(/https?:\/\/[^\s<>"]+/g)).map((match) => ({ ...source(message), url: match[0] })));
    return { media, files: media.filter((item) => item.attachment.kind === "audio"), links };
  }

  async getMessages(roomId: string, currentUserId?: string): Promise<ApiMessage[]> {
    return (await this.getMessagePage(roomId, undefined, currentUserId)).items;
  }

  async searchRoomMessages(roomId: string, query: string, currentUserId: string): Promise<ApiMessage[]> {
    await this.assertRoom(roomId);
    const messages = await this.prisma.message.findMany({
      where: {
        roomId,
        deletedAt: null,
        OR: [
          { body: { contains: query, mode: "insensitive" } },
          { authorName: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } },
    });
    return messages.map((message) => this.toApiMessage(message, currentUserId));
  }

  async getRoomMessage(roomId: string, messageId: string, currentUserId: string): Promise<ApiMessage> {
    await this.assertRoom(roomId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, roomId, deletedAt: null },
      include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } },
    });
    if (!message) throw new NotFoundException("Сообщение не найдено");
    return this.toApiMessage(message, currentUserId);
  }

  async getSnapshot(roomId: string, currentUserId?: string): Promise<RoomSnapshot> {
    const [room, messages] = await Promise.all([
      this.assertRoom(roomId),
      this.getMessages(roomId, currentUserId),
    ]);

    return {
      room: await this.toApiRoom(room),
      messages,
      people: [],
      videoSession: await this.getVideoState(roomId),
    };
  }

  async createMessage(
    roomId: string,
    body: string,
    requestId: string | undefined,
    authorId: string,
    authorName: string,
    attachmentId?: string,
    replyToId?: string,
    adminVoice = false,
    gifUrl?: string,
    mentionUserIds?: string[],
    anonymousAuthor = false,
  ): Promise<ApiMessage> {
    await this.assertCanWrite(authorId);
    await assertNotInChaos(this.prisma, authorId);
    const normalizedGifUrl = normalizeGifUrl(gifUrl);
    if (!body.trim() && !attachmentId && !normalizedGifUrl) throw new BadRequestException("Введите сообщение или прикрепите файл");
    await this.assertRoom(roomId);
    if (adminVoice) {
      if (!body.trim()) throw new BadRequestException("Введите текст для «Гласа админа»");
      const author = await this.prisma.user.findUnique({ where: { id: authorId }, select: { role: true } });
      if (author?.role !== "ADMIN" && author?.role !== "MODERATOR") throw new ForbiddenException("«Глас админа» доступен только администрации и модераторам");
    }
    await this.assertReplyTarget(replyToId, { roomId });

    if (requestId) {
      const existing = await this.prisma.message.findUnique({ where: { requestId }, include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } } });
      if (existing) {
        if (existing.authorId !== (anonymousAuthor ? null : authorId) || existing.roomId !== roomId) {
          throw new ConflictException("requestId уже использован");
        }
        if (attachmentId && existing.attachments.length === 0) await this.attachments.attachToMessage(authorId, attachmentId, existing.id);
        return this.toApiMessage(existing);
      }
    }

    const policy = await this.settings.assertMessage(authorId, body);
    let created = true;
    const message = await this.prisma.$transaction(async tx => {
      // Per-user lock covers guest cooldown across HTTP, Socket.IO and all rooms.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${authorId + ":message"}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${authorId + ":" + roomId}, 0))`;
      const author = await tx.user.findUnique({ where: { id: authorId }, select: { isGuest: true } });
      if (author?.isGuest) {
        const lastGuestMessage = await tx.message.findFirst({ where: { authorId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        if (lastGuestMessage && lastGuestMessage.createdAt.getTime() + 10_000 > Date.now()) {
          throw new ForbiddenException("Гости могут отправлять одно сообщение раз в 10 секунд");
        }
      }
      if (requestId) {
        const retry = await tx.message.findUnique({ where: { requestId } });
        if (retry) {
          if (retry.authorId !== (anonymousAuthor ? null : authorId) || retry.roomId !== roomId) throw new ConflictException("requestId уже использован");
          created = false; return retry;
        }
      }
      if (policy.slowModeSeconds > 0) {
        const last = await tx.message.findFirst({ where: { authorId, roomId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        if (last && last.createdAt.getTime() + policy.slowModeSeconds * 1000 > Date.now()) throw new ForbiddenException("Медленный режим: подождите " + policy.slowModeSeconds + " секунд между сообщениями");
      }
      return tx.message.create({
      data: {
        roomId,
        authorId: anonymousAuthor ? null : authorId,
        authorName,
        body: body.trim(),
        adminVoice,
        requestId,
        replyToId,
        gifUrl: normalizedGifUrl,
      },
      });
    }).catch(async (error: unknown) => {
      if (!requestId || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await this.prisma.message.findUnique({ where: { requestId } });
      if (!existing || existing.authorId !== (anonymousAuthor ? null : authorId) || existing.roomId !== roomId) throw new ConflictException("requestId уже использован");
      created = false;
      return existing;
    });
    if (!created) return this.getRoomMessage(roomId, message.id, authorId);
    try {
      await this.attachments.attachToMessage(authorId, attachmentId, message.id);
    } catch (error) {
      await this.prisma.message.delete({ where: { id: message.id } });
      throw error;
    }
    const completed = await this.prisma.message.findUniqueOrThrow({ where: { id: message.id }, include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } } });
    await Promise.all([
      this.notifications.createReply(authorId, completed.id, replyToId),
      this.notifications.createMentions(authorId, completed.id, completed.body, mentionUserIds),
      this.economy.awardForPublicMessage(authorId, completed.id, completed.body, completed.replyTo?.authorId ?? undefined),
    ]);
    await this.push.adminMessage(authorId, roomId, authorName, completed.body);
    if (roomId === "main" && process.env.TUSOVA_QUIZ_ENABLED === "true") {
      await this.prisma.message.update({ where: { id: completed.id }, data: { quizAcceptedAt: new Date() } });
    }
    for (const listener of this.messageListeners) {
      listener({ roomId, authorId, requestId, message: this.toApiMessage(completed) });
    }
    return this.toApiMessage(completed, authorId);
  }

  async createBotMessage(roomId: string, authorId: string, authorName: string, body: string): Promise<ApiMessage> {
    await this.assertRoom(roomId);
    const message = await this.prisma.message.create({
      data: { roomId, authorId, authorName, body },
      include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true },
    });
    await this.notifications.createMentions(authorId, message.id, body);
    return this.toApiMessage(message);
  }

  async createSystemMessage(body: string, greetingRecipientId?: string): Promise<ApiMessage> {
    const message = await this.prisma.message.create({
      data: { roomId: "main", authorName: "Система", body, kind: "SYSTEM", requestId: greetingRecipientId ? "presence:" + greetingRecipientId + ":" + randomUUID() : undefined },
      include: { attachments: true, reactions: true },
    });
    return this.toApiMessage(message);
  }
  async greetJoin(actorId: string, joinedMessageId: string): Promise<ApiMessage> {
    const joined = await this.prisma.message.findFirst({ where: { id: joinedMessageId, roomId: "main", kind: "SYSTEM", requestId: { startsWith: "presence:" }, body: { endsWith: " вошёл в чат." }, deletedAt: null }, select: { id: true, requestId: true } });
    const targetId = joined?.requestId?.split(":")[1];
    if (!targetId) throw new NotFoundException("Оповещение о входе не найдено");
    if (targetId === actorId) throw new ForbiddenException("Нельзя приветствовать самого себя");
    const requestId = "greeting:" + targetId + ":" + joined.id;
    const existing = await this.prisma.message.findUnique({ where: { requestId }, include: { attachments: true, reactions: true } });
    if (existing) return this.toApiMessage(existing);
    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true, deletedAt: true } }),
      this.prisma.user.findUnique({ where: { id: targetId }, select: { displayName: true, deletedAt: true } }),
    ]);
    if (!actor || actor.deletedAt || !target || target.deletedAt) throw new NotFoundException("Участник недоступен");
    const message = await this.prisma.message.create({
      data: { roomId: "main", authorName: "Система", body: "Пользователь " + actor.displayName + " приветствует " + target.displayName + " 👋", kind: "SYSTEM", requestId },
      include: { attachments: true, reactions: true },
    });
    const apiMessage = this.toApiMessage(message);
    for (const listener of this.messageListeners) listener({ roomId: "main", authorId: actorId, requestId, message: apiMessage });
    return apiMessage;
  }

  async listUsers(currentUserId: string): Promise<ApiPerson[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      include: { memberships: { orderBy: { joinedAt: "asc" }, take: 1 }, cosmetics: true },
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      name: user.displayName,
      status: user.status.toLowerCase() as ApiPerson["status"],
      gender: user.gender.toLowerCase() as ApiPerson["gender"],
      isBot: user.isBot || undefined,
      isGuest: user.isGuest,
      role: user.role === "USER" ? undefined : user.role.toLowerCase(),
      isDj: user.isDj,
      hideRole: user.hideRole,
      hideDj: user.hideDj,
      room: user.memberships[0]?.roomId ?? "main",
      avatar: user.avatarKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + user.avatarKey : user.displayName[0]?.toUpperCase() ?? "?",
      avatarThumbnail: user.avatarThumbKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + user.avatarThumbKey : undefined,
      appearance: cosmeticAppearance(user.cosmetics),
    }));
  }

  async listDirectConversations(userId: string): Promise<DirectConversation[]> {
    const heads = await this.prisma.$queryRaw<Array<{ messageId: string; peerId: string }>>(Prisma.sql`
      SELECT DISTINCT ON ("peerId") "messageId", "peerId"
      FROM (
        SELECT
          m.id AS "messageId",
          CASE WHEN m.author_id = ${userId}::uuid THEN m.recipient_id ELSE m.author_id END AS "peerId",
          m.created_at AS "createdAt"
        FROM messages m
        WHERE m.room_id IS NULL
          AND m.deleted_at IS NULL
          AND (m.author_id = ${userId}::uuid OR m.recipient_id = ${userId}::uuid)
      ) direct_messages
      WHERE "peerId" IS NOT NULL
      ORDER BY "peerId", "createdAt" DESC
    `);

    if (heads.length === 0) return [];

    const peerIds = heads.map((head) => head.peerId);
    const [messages, peers, unreadGroups] = await Promise.all([
      this.prisma.message.findMany({ where: { id: { in: heads.map((head) => head.messageId) } }, include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } } }),
      this.prisma.user.findMany({
        where: { id: { in: peerIds }, deletedAt: null },
        include: { memberships: { orderBy: { joinedAt: "asc" }, take: 1 } },
      }),
      this.prisma.message.groupBy({
        by: ["authorId"],
        where: { recipientId: userId, roomId: null, readAt: null, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const messageById = new Map(messages.map((message) => [message.id, message]));
    const peerById = new Map(peers.map((peer) => [peer.id, peer]));
    const unreadByPeer = new Map(unreadGroups.map((group) => [group.authorId, group._count._all]));

    return heads.flatMap((head) => {
      const message = messageById.get(head.messageId);
      const peer = peerById.get(head.peerId);
      if (!message || !peer) return [];

      return [{
        peer: {
          id: peer.id,
          username: peer.username,
          name: peer.displayName,
          status: peer.status.toLowerCase() as ApiPerson["status"],
          role: peer.role === "USER" ? undefined : peer.role.toLowerCase(),
          isDj: peer.isDj,
          hideRole: peer.hideRole,
          hideDj: peer.hideDj,
          room: peer.memberships[0]?.roomId ?? "main",
          avatar: peer.displayName[0]?.toUpperCase() ?? "?",
          gender: peer.gender.toLowerCase() as ApiPerson["gender"],
          isGuest: peer.isGuest,
        },
        lastMessage: this.toApiMessage(message, userId),
        unread: unreadByPeer.get(peer.id) ?? 0,
        updatedAt: message.createdAt.toISOString(),
      }];
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async markDirectRead(userId: string, peerId: string) {
    await this.assertPeer(userId, peerId);
    const result = await this.prisma.message.updateMany({
      where: { authorId: peerId, recipientId: userId, readAt: null, deletedAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async getDirectMessagePage(userId: string, peerId: string, cursor?: string) {
    await this.assertPeer(userId, peerId);
    const messages = await this.prisma.message.findMany({
      where: {
        deletedAt: null,
        OR: [
          { authorId: userId, recipientId: peerId },
          { authorId: peerId, recipientId: userId },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } },
    });
    const hasMore = messages.length > 50;
    const page = messages.slice(0, 50);
    return {
      items: [...page].reverse().map((message) => this.toApiMessage(message, userId)),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async getDirectMessages(userId: string, peerId: string): Promise<ApiMessage[]> {
    return (await this.getDirectMessagePage(userId, peerId)).items;
  }

  async searchDirectMessages(userId: string, peerId: string, query: string): Promise<ApiMessage[]> {
    await this.assertPeer(userId, peerId);
    const messages = await this.prisma.message.findMany({
      where: {
        deletedAt: null,
        AND: [
          { OR: [{ authorId: userId, recipientId: peerId }, { authorId: peerId, recipientId: userId }] },
          { OR: [{ body: { contains: query, mode: "insensitive" } }, { authorName: { contains: query, mode: "insensitive" } }] },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } },
    });
    return messages.map((message) => this.toApiMessage(message, userId));
  }

  async createDirectMessage(
    recipientId: string,
    body: string,
    requestId: string,
    authorId: string,
    authorName: string,
    attachmentId?: string,
    replyToId?: string,
    gifUrl?: string,
  ): Promise<ApiMessage> {
    await this.assertCanWrite(authorId);
    const normalizedGifUrl = normalizeGifUrl(gifUrl);
    if (!body.trim() && !attachmentId && !normalizedGifUrl) throw new BadRequestException("Введите сообщение или прикрепите файл");
    await this.assertPeer(authorId, recipientId);
    await this.assertReplyTarget(replyToId, { participantIds: [authorId, recipientId] });

    const existing = await this.prisma.message.findUnique({ where: { requestId }, include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } } });
    if (existing) {
      if (existing.authorId !== authorId || existing.recipientId !== recipientId) {
        throw new ConflictException("requestId уже использован");
      }
      if (attachmentId && existing.attachments.length === 0) await this.attachments.attachToMessage(authorId, attachmentId, existing.id);
      return this.toApiMessage(existing);
    }

    await this.settings.assertMessage(authorId, body);
    let created = true;
    const message = await this.prisma.message.create({
      data: { recipientId, authorId, authorName, body: body.trim(), requestId, replyToId, gifUrl: normalizedGifUrl },
    }).catch(async (error: unknown) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const duplicate = await this.prisma.message.findUnique({ where: { requestId } });
      if (!duplicate || duplicate.authorId !== authorId || duplicate.recipientId !== recipientId) {
        throw new ConflictException("requestId уже использован");
      }
      created = false;
      return duplicate;
    });
    if (!created) {
      const duplicate = await this.prisma.message.findUniqueOrThrow({ where: { id: message.id }, include: {
        author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } },
        attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } },
      } });
      return this.toApiMessage(duplicate, authorId);
    }
    try {
      await this.attachments.attachToMessage(authorId, attachmentId, message.id);
    } catch (error) {
      await this.prisma.message.delete({ where: { id: message.id } });
      throw error;
    }
    const completed = await this.prisma.message.findUniqueOrThrow({ where: { id: message.id }, include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } } });
    await this.notifications.createReply(authorId, completed.id, replyToId);
    await this.push.direct(recipientId, authorName, completed.body);
    for (const listener of this.messageListeners) {
      listener({ recipientId, authorId, requestId, message: this.toApiMessage(completed) });
    }
    return this.toApiMessage(completed, authorId);
  }

  async editMessage(authorId: string, messageId: string, body: string) { await this.assertCanWrite(authorId); const message = await this.prisma.message.findFirst({ where: { id: messageId, authorId, deletedAt: null } }); if (!message) throw new NotFoundException("Сообщение не найдено"); if (message.kind === "SYSTEM" || message.quizKind || message.adminVoice) throw new ForbiddenException("Это сообщение нельзя редактировать"); if (message.createdAt.getTime() + 180000 < Date.now()) throw new ForbiddenException("Редактировать сообщение можно только в течение трёх минут"); const text = body.trim(); if (!text) throw new BadRequestException("Введите текст сообщения"); await this.settings.assertMessage(authorId, text); const updated = await this.prisma.message.update({ where: { id: messageId }, data: { body: text, editedAt: new Date() }, include: { author: { select: { avatarKey: true, cosmetics: { select: { effectKey: true, settings: true } } } }, attachments: true, reactions: true, replyTo: { select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } } } }); return { roomId: updated.roomId ?? undefined, recipientId: updated.recipientId ?? undefined, message: this.toApiMessage(updated, authorId) }; }
  async toggleReaction(userId: string, messageId: string, type: ReactionType): Promise<ReactionUpdate> {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, deletedAt: null } });
    if (!message) throw new NotFoundException("Сообщение не найдено");
    if (message.kind === "SYSTEM") throw new BadRequestException("Системные сообщения нельзя оценивать");
    if (message.recipientId && message.authorId !== userId && message.recipientId !== userId) {
      throw new ForbiddenException("Эта переписка вам недоступна");
    }

    const result = await this.prisma.$transaction(async (prisma) => {
      const existing = await prisma.messageReaction.findUnique({ where: { messageId_userId: { messageId, userId } } });
      let selected: ReactionType | null = type;
      if (existing?.type === type) {
        await prisma.messageReaction.delete({ where: { id: existing.id } });
        selected = null;
      } else {
        await prisma.messageReaction.upsert({
          where: { messageId_userId: { messageId, userId } },
          create: { messageId, userId, type },
          update: { type },
        });
      }
      const counts = await prisma.messageReaction.groupBy({
        by: ["type"],
        where: { messageId },
        _count: { _all: true },
        orderBy: { type: "asc" },
      });
      return { selected, counts };
    });

    await this.notifications.syncReaction(userId, message, result.selected);

    return {
      messageId,
      userId,
      selected: result.selected ? result.selected.toLowerCase() as ApiReactionType : null,
      reactions: result.counts.map((item) => ({ type: item.type.toLowerCase() as ApiReactionType, count: item._count._all })),
      roomId: message.roomId ?? undefined,
      participantIds: message.recipientId ? [message.authorId, message.recipientId].filter((id): id is string => Boolean(id)) : undefined,
    };
  }
  private async assertReplyTarget(replyToId: string | undefined, context: { roomId?: string; participantIds?: string[] }) {
    if (!replyToId) return;
    const target = await this.prisma.message.findFirst({
      where: { id: replyToId, deletedAt: null },
      select: { authorId: true, recipientId: true, roomId: true },
    });
    if (!target) throw new NotFoundException("Цитируемое сообщение не найдено");
    if (context.roomId) {
      if (target.roomId !== context.roomId) throw new BadRequestException("Можно отвечать только на сообщение из текущей комнаты");
      return;
    }
    const expected = new Set(context.participantIds ?? []);
    if (target.roomId || !target.authorId || !target.recipientId || !expected.has(target.authorId) || !expected.has(target.recipientId)) {
      throw new BadRequestException("Можно отвечать только на сообщение из текущего личного диалога");
    }
  }
  private async assertCanWrite(userId: string) {
    const now = new Date();
    const [mute, ban] = await Promise.all([
      this.prisma.mute.findFirst({ where: { userId, expiresAt: { gt: now } } }),
      this.prisma.ban.findFirst({
        where: {
          userId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);
    if (ban) throw new ForbiddenException("Аккаунт заблокирован");
    if (mute) throw new ForbiddenException("Вы не можете писать до " + mute.expiresAt.toLocaleString("ru-RU"));
  }

  async setPresence(userId: string, status: "online" | "away" | "dnd" | "offline") {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: status.toUpperCase() as "ONLINE" | "AWAY" | "DND" | "OFFLINE" },
    });
  }

  async setVideoSource(roomId: string, userId: string, videoUrl: string) {
    const room = await this.assertRoom(roomId);
    if (!room.isVideoRoom) throw new BadRequestException("Это не видеокомната");
    await this.assertVideoMembership(roomId, userId);
    const source = this.normalizeVideoUrl(videoUrl);
    const initialTitle = this.videoQueueLabel(source);
    const { settings } = await this.settings.read();
    const price = settings.videoQueuePrice;
    const itemId = randomUUID();

    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "video-room:" + roomId);

      if (price > 0) {
        const debited = await tx.user.updateMany({
          where: { id: userId, deletedAt: null, credits: { gte: price } },
          data: { credits: { decrement: price } },
        });
        if (debited.count !== 1) throw new BadRequestException("Недостаточно кредитов для добавления видео в очередь");
        const balance = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
        await tx.economyEntry.create({
          data: {
            userId,
            type: EconomyEntryType.VIDEO_QUEUE,
            creditsDelta: -price,
            balanceAfter: balance.credits,
            referenceKey: "video-queue:" + itemId,
          },
        });
      }

      await tx.videoRoomQueueItem.create({
        data: { id: itemId, roomId, ownerId: userId, provider: source.provider, videoUrl: source.url, title: initialTitle },
      });

      const current = await tx.videoRoomSession.findUnique({ where: { roomId } });
      if (!current?.currentItemId) await this.activateNextVideo(tx, roomId, false);
    });

    return this.getVideoState(roomId);
  }

  async controlVideo(roomId: string, userId: string, role: "user" | "moderator" | "admin", action: "play" | "pause" | "seek", position?: number) {
    const room = await this.assertRoom(roomId);
    if (!room.isVideoRoom) throw new BadRequestException("Это не видеокомната");
    await this.assertVideoMembership(roomId, userId);
    const current = await this.prisma.videoRoomSession.findUnique({ where: { roomId } });
    if (!current?.videoUrl || !current.currentItemId) throw new BadRequestException("Очередь видео пуста");
    if (!this.canManageVideo(userId, role, current.controllerId)) throw new ForbiddenException("Управлять этим видео может его автор или модератор");
    const nextPosition = Math.max(0, position ?? this.actualVideoPosition(current));
    await this.prisma.videoRoomSession.update({
      where: { roomId },
      data: {
        position: nextPosition,
        playing: action === "play" ? true : action === "pause" ? false : current.playing,
      },
    });
    return this.getVideoState(roomId);
  }

  async removeVideoQueueItem(roomId: string, userId: string, role: "user" | "moderator" | "admin", itemId: string) {
    const room = await this.assertRoom(roomId);
    if (!room.isVideoRoom) throw new BadRequestException("Это не видеокомната");
    await this.assertVideoMembership(roomId, userId);

    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "video-room:" + roomId);
      const item = await tx.videoRoomQueueItem.findFirst({ where: { id: itemId, roomId } });
      if (!item) throw new NotFoundException("Видео в очереди не найдено");
      if (!this.canManageVideo(userId, role, item.ownerId)) throw new ForbiddenException("Удалять можно только своё видео");
      const session = await tx.videoRoomSession.findUnique({ where: { roomId } });
      await tx.videoRoomQueueItem.delete({ where: { id: item.id } });
      if (session?.currentItemId === item.id) await this.activateNextVideo(tx, roomId, false);
    });

    return this.getVideoState(roomId);
  }

  async finishVideo(roomId: string, userId: string, role: "user" | "moderator" | "admin", itemId: string) {
    const room = await this.assertRoom(roomId);
    if (!room.isVideoRoom) throw new BadRequestException("Это не видеокомната");
    await this.assertVideoMembership(roomId, userId);

    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "video-room:" + roomId);
      const session = await tx.videoRoomSession.findUnique({ where: { roomId } });
      if (!session?.currentItemId || session.currentItemId !== itemId) return;
      const item = await tx.videoRoomQueueItem.findUnique({ where: { id: session.currentItemId } });
      if (!item) {
        await this.activateNextVideo(tx, roomId, true);
        return;
      }
      if (!this.canManageVideo(userId, role, item.ownerId)) throw new ForbiddenException("Завершить это видео может его автор или модератор");
      await tx.videoRoomQueueItem.delete({ where: { id: item.id } });
      await this.activateNextVideo(tx, roomId, true);
    });

    return this.getVideoState(roomId);
  }

  async updateVideoTitle(roomId: string, userId: string, role: "user" | "moderator" | "admin", itemId: string, title: string) {
    await this.assertVideoMembership(roomId, userId);
    const item = await this.prisma.videoRoomQueueItem.findFirst({ where: { id: itemId, roomId } });
    if (!item) return this.getVideoState(roomId);
    if (!this.canManageVideo(userId, role, item.ownerId)) throw new ForbiddenException("Изменять данные чужого видео нельзя");
    const clean = title.trim().slice(0, 300);
    if (clean && clean !== item.title) await this.prisma.videoRoomQueueItem.update({ where: { id: item.id }, data: { title: clean } });
    return this.getVideoState(roomId);
  }

  async getVideoStateForMember(roomId: string, userId: string) {
    const room = await this.assertRoom(roomId);
    if (!room.isVideoRoom) throw new BadRequestException("Это не видеокомната");
    await this.assertVideoMembership(roomId, userId);
    return this.getVideoState(roomId);
  }

  async getVideoState(roomId: string) {
    const [session, queue, settingsRecord] = await Promise.all([
      this.prisma.videoRoomSession.findUnique({ where: { roomId } }),
      this.prisma.videoRoomQueueItem.findMany({
        where: { roomId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { owner: { select: { id: true, displayName: true } } },
      }),
      this.settings.read(),
    ]);
    const serializedAt = new Date();
    return {
      roomId,
      provider: (session?.provider ?? null) as "youtube" | "vk" | "rutube" | null,
      videoUrl: session?.videoUrl ?? null,
      controllerId: session?.controllerId ?? null,
      currentItemId: session?.currentItemId ?? null,
      position: session ? this.actualVideoPosition(session) : 0,
      playing: session?.playing ?? false,
      updatedAt: serializedAt.toISOString(),
      queuePrice: settingsRecord.settings.videoQueuePrice,
      queue: queue.map(item => ({
        id: item.id,
        ownerId: item.ownerId,
        ownerName: item.owner.displayName,
        provider: item.provider as "youtube" | "vk" | "rutube",
        videoUrl: item.videoUrl,
        title: item.title,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private canManageVideo(userId: string, role: "user" | "moderator" | "admin", ownerId: string | null) {
    return ownerId === userId || role === "moderator" || role === "admin";
  }

  private async activateNextVideo(tx: Prisma.TransactionClient, roomId: string, playing: boolean) {
    const next = await tx.videoRoomQueueItem.findFirst({
      where: { roomId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (next) {
      await tx.videoRoomSession.upsert({
        where: { roomId },
        create: {
          roomId,
          provider: next.provider,
          videoUrl: next.videoUrl,
          controllerId: next.ownerId,
          currentItemId: next.id,
          position: 0,
          playing,
        },
        update: {
          provider: next.provider,
          videoUrl: next.videoUrl,
          controllerId: next.ownerId,
          currentItemId: next.id,
          position: 0,
          playing,
        },
      });
      return;
    }
    await tx.videoRoomSession.upsert({
      where: { roomId },
      create: { roomId, provider: null, videoUrl: null, controllerId: null, currentItemId: null, position: 0, playing: false },
      update: { provider: null, videoUrl: null, controllerId: null, currentItemId: null, position: 0, playing: false },
    });
  }

  private async assertVideoMembership(roomId: string, userId: string) {
    const member = await this.prisma.roomMembership.findUnique({ where: { userId_roomId: { userId, roomId } } });
    if (!member) throw new ForbiddenException("Сначала войдите в комнату");
  }

  private videoQueueLabel(source: { provider: string; url: string }) {
    const url = new URL(source.url);
    if (source.provider === "youtube") {
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const id = host === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.searchParams.get("v") ?? url.pathname.match(/\/(?:shorts|embed)\/([^/?#]+)/)?.[1];
      return id ? "YouTube · " + id : "YouTube";
    }
    if (source.provider === "rutube") {
      const id = url.pathname.match(/\/(?:video|shorts)\/([^/?#]+)/)?.[1];
      return id ? "Rutube · " + id.slice(0, 16) : "Rutube";
    }
    const id = (url.pathname + url.search).match(/video(-?\d+_\d+)/i)?.[1];
    return id ? "VK Видео · " + id : "VK Видео";
  }

  private normalizeVideoUrl(value: string) {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new BadRequestException("Некорректная ссылка на видео"); }
    if (url.protocol !== "https:") throw new BadRequestException("Нужна защищённая ссылка https");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const provider = host === "youtu.be" || host.endsWith("youtube.com") ? "youtube" : host.endsWith("vk.com") || host.endsWith("vkvideo.ru") ? "vk" : host.endsWith("rutube.ru") ? "rutube" : null;
    if (!provider) throw new BadRequestException("Поддерживаются ссылки YouTube, VK Видео и Rutube");
    return { provider, url: url.toString() };
  }

  private actualVideoPosition(session: { position: number; playing: boolean; updatedAt: Date }) {
    return Math.max(0, session.position + (session.playing ? (Date.now() - session.updatedAt.getTime()) / 1000 : 0));
  }

  private async assertPeer(userId: string, peerId: string) {
    if (userId === peerId) throw new BadRequestException("Нельзя написать самому себе");
    const peer = await this.prisma.user.findFirst({ where: { id: peerId, deletedAt: null } });
    if (!peer) throw new NotFoundException("Пользователь не найден");
    return peer;
  }

  private async assertRoom(roomId: string): Promise<Room> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException("Комната не найдена");
    return room;
  }

  private async toApiRoom(room: Room): Promise<ApiRoom> {
    const [online, memberCount] = await Promise.all([
      this.prisma.roomMembership.count({ where: { roomId: room.id, user: { status: "ONLINE" } } }),
      this.prisma.roomMembership.count({ where: { roomId: room.id } }),
    ]);
    const visibility = room.visibility.toLowerCase() as ApiRoom["visibility"];
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      tone: room.tone,
      coverEmoji: room.coverEmoji,
      coverUrl: room.coverKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + room.coverKey : undefined,
      coverThumbnailUrl: room.coverThumbKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + room.coverThumbKey : undefined,
      rules: room.rules,
      visibility,
      kind: room.id === "main" ? "general" : room.isVideoRoom ? "video" : visibility,
      isVideoRoom: room.isVideoRoom,
      createdAt: room.createdAt.toISOString(),
      memberCount,
      online,
      createdById: room.createdById ?? undefined,
    };
  }

  private async deleteRoomCover(key: string | null) {
    if (!key || !key.startsWith("/uploads/room-covers/")) return;
    await unlink(join(process.cwd(), key.slice(1))).catch(() => undefined);
  }

  private toApiMessage(message: Message & { author?: { avatarKey: string | null; cosmetics?: Array<{ effectKey: string; settings: Prisma.JsonValue }> } | null; attachments?: Attachment[]; reactions?: MessageReaction[]; replyTo?: { id: string; authorId: string | null; authorName: string; body: string; createdAt: Date } | null }, currentUserId?: string): ApiMessage {
    const grouped = new Map<ApiReactionType, { count: number; mine: boolean }>();
    for (const reaction of message.reactions ?? []) {
      const type = reaction.type.toLowerCase() as ApiReactionType;
      const current = grouped.get(type) ?? { count: 0, mine: false };
      grouped.set(type, { count: current.count + 1, mine: current.mine || reaction.userId === currentUserId });
    }
    return {
      id: message.id,
      authorId: message.authorId ?? undefined,
      author: message.authorName,
      quizKind: message.quizKind ?? undefined,
      quizRoundId: message.quizRoundId ?? undefined,
      appearance: message.author?.cosmetics ? cosmeticAppearance(message.author.cosmetics) : undefined,
      adminVoice: message.adminVoice || undefined,
      avatarUrl: message.author?.avatarKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + message.author.avatarKey : undefined,
      body: message.body,
      gifUrl: message.gifUrl ?? undefined,
      time: formatChatTime(message.createdAt),
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString(),
      system: message.kind === "SYSTEM",
      greetingRecipientId: message.kind === "SYSTEM" ? message.requestId?.match(/^(?:presence|greeting):([a-f0-9-]{36}):/i)?.[1] : undefined,
      attachments: (message.attachments ?? []).map((attachment) => this.attachments.toApi(attachment, message.roomId)),
      reactions: [...grouped.entries()].map(([type, value]) => ({ type, ...value })),
      replyTo: message.replyTo ? { id: message.replyTo.id, authorId: message.replyTo.authorId ?? undefined, author: message.replyTo.authorName, body: message.replyTo.body, time: formatChatTime(message.replyTo.createdAt), createdAt: message.replyTo.createdAt.toISOString() } : undefined,
    };
  }
}

import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EconomyEntryType } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { cosmeticAppearance } from "../gifts/cosmetics";
import { PrismaService } from "../database/prisma.service";
import { AttachmentsService } from "../attachments/attachments.service";
import { assertNotInChaos } from "../moderation/chaos.guard";
import type { CreateCommunityDto, UpdateCommunityDto } from "./community.dto";

const authorSelect = { id: true, username: true, displayName: true, avatarKey: true, avatarThumbKey: true, status: true, gender: true, role: true, isBot: true, cosmetics: { select: { effectKey: true, settings: true } } } as const;
const COMMUNITY_CREATION_COST = 1000;

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService, private readonly attachments: AttachmentsService) {}

  async list(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [items, ownMemberships] = await Promise.all([
      this.prisma.community.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          memberships: { where: { status: "APPROVED" }, take: 4, orderBy: { createdAt: "asc" }, include: { user: { select: authorSelect } } },
          _count: { select: { memberships: { where: { status: "APPROVED" } }, messages: { where: { createdAt: { gte: since } } } } },
        },
      }),
      this.prisma.communityMembership.findMany({ where: { userId }, select: { communityId: true, role: true, status: true } }),
    ]);
    const own = new Map(ownMemberships.map((membership) => [membership.communityId, membership]));
    return items.map((item) => ({
      ...this.toSummary({ ...item, memberships: own.has(item.id) ? [own.get(item.id)] : [] }),
      memberPreview: item.memberships.map(({ user }) => ({ id: user.id, displayName: user.displayName, avatarUrl: this.avatarUrl(user.avatarThumbKey ?? user.avatarKey) })),
    }));
  }

  async uploadCover(id: string, actor: AuthenticatedUser, file?: { buffer: Buffer; mimetype: string; size: number }) {
    await this.assertOwner(id, actor);
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.mimetype) || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("Выберите JPG, PNG или WebP размером до 10 МБ");
    }
    let cover: Buffer;
    try {
      const input = sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 });
      const metadata = await input.metadata();
      if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new Error("Unsupported image");
      cover = await input.rotate().resize(960, 480, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException("Не удалось прочитать изображение");
    }
    const filename = randomUUID() + ".webp";
    const directory = join(process.cwd(), "uploads", "community-covers");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), cover);
    try {
      await this.prisma.community.update({ where: { id }, data: { coverKey: "/uploads/community-covers/" + filename } });
    } catch (error) {
      await unlink(join(directory, filename)).catch(() => undefined);
      throw error;
    }
    return this.detail(id, actor.id);
  }

  async menuBadge(actor: AuthenticatedUser) {
    if (actor.role === "admin") {
      return { pendingRequests: await this.prisma.communityMembership.count({ where: { status: "PENDING" } }) };
    }
    const pendingRequests = await this.prisma.communityMembership.count({
      where: {
        status: "PENDING",
        community: { is: { memberships: { some: { userId: actor.id, status: "APPROVED", role: { in: ["OWNER", "MODERATOR"] } } } } },
      },
    });
    return { pendingRequests };
  }

  async detail(id: string, userId: string) {
    const item = await this.prisma.community.findUnique({
      where: { id },
      include: {
        memberships: { where: { OR: [{ userId }, { status: "APPROVED" }] }, include: { user: { select: authorSelect } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
        posts: { where: { deletedAt: null }, take: 50, orderBy: { createdAt: "desc" }, include: { author: { select: authorSelect } } },
        _count: { select: { memberships: { where: { status: "APPROVED" } } } },
      },
    });
    if (!item) throw new NotFoundException("Сообщество не найдено");
    const own = item.memberships.find((membership) => membership.userId === userId);
    return {
      ...this.toSummary({ ...item, memberships: own ? [own] : [] }),
      members: item.memberships.filter((membership) => membership.status === "APPROVED").map((membership) => ({ id: membership.user.id, username: membership.user.username, displayName: membership.user.displayName, avatarUrl: this.avatarUrl(membership.user.avatarKey), avatarThumbnailUrl: this.avatarUrl(membership.user.avatarThumbKey ?? membership.user.avatarKey), role: membership.role.toLowerCase(), status: membership.user.status.toLowerCase(), gender: membership.user.gender.toLowerCase(), siteRole: membership.user.role.toLowerCase(), isBot: membership.user.isBot, appearance: cosmeticAppearance(membership.user.cosmetics) })) ,
      posts: item.posts.map((post) => ({ id: post.id, body: post.body, createdAt: post.createdAt.toISOString(), author: { id: post.author.id, displayName: post.author.displayName, avatarUrl: this.avatarUrl(post.author.avatarKey) } })),
    };
  }

  async create(actor: AuthenticatedUser, input: CreateCommunityDto) {
    await assertNotInChaos(this.prisma, actor.id);
    const community = await this.prisma.$transaction(async (tx) => {
      const [membership, user] = await Promise.all([
        tx.communityMembership.findFirst({ where: { userId: actor.id, status: "APPROVED" } }),
        tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { credits: true } }),
      ]);
      if (membership) throw new BadRequestException("Можно состоять только в одном сообществе");
      if (user.credits < COMMUNITY_CREATION_COST) throw new BadRequestException("Для создания сообщества нужно 1000 кредитов");
      const updated = await tx.user.update({
        where: { id: actor.id },
        data: { credits: { decrement: COMMUNITY_CREATION_COST } },
        select: { credits: true },
      });
      await tx.economyEntry.create({
        data: {
          userId: actor.id,
          type: EconomyEntryType.COMMUNITY_CREATION,
          creditsDelta: -COMMUNITY_CREATION_COST,
          balanceAfter: updated.credits,
        },
      });
      return tx.community.create({
        data: {
          name: input.name,
          description: input.description ?? "",
          joinPolicy: input.joinPolicy === "approval" ? "APPROVAL" : "OPEN",
          createdById: actor.id,
          memberships: { create: { userId: actor.id, role: "OWNER", status: "APPROVED" } },
        },
        include: {
          memberships: { where: { userId: actor.id }, select: { role: true, status: true } },
          _count: { select: { memberships: true } },
        },
      });
    });
    return this.toSummary(community);
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateCommunityDto) {
    await this.assertOwner(id, actor);
    const community = await this.prisma.community.update({
      where: { id },
      data: { name: input.name, description: input.description, joinPolicy: input.joinPolicy ? input.joinPolicy.toUpperCase() as "OPEN" | "APPROVAL" : undefined },
      include: { memberships: { where: { userId: actor.id }, select: { role: true, status: true } }, _count: { select: { memberships: { where: { status: "APPROVED" } } } } },
    });
    return this.toSummary(community);
  }

  async join(id: string, actor: AuthenticatedUser) {
    const community = await this.getCommunity(id);
    await this.assertNoOtherApprovedMembership(actor.id, id);
    const status = community.joinPolicy === "OPEN" ? "APPROVED" : "PENDING";
    const membership = await this.prisma.communityMembership.upsert({ where: { communityId_userId: { communityId: id, userId: actor.id } }, create: { communityId: id, userId: actor.id, status }, update: { status } });
    return { status: membership.status.toLowerCase(), joined: membership.status === "APPROVED" };
  }

  async leave(id: string, actor: AuthenticatedUser) {
    const membership = await this.prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: actor.id } } });
    if (!membership) return { left: true };
    if (membership.role === "OWNER") throw new BadRequestException("Владелец не может покинуть своё сообщество");
    await this.prisma.communityMembership.delete({ where: { communityId_userId: { communityId: id, userId: actor.id } } });
    return { left: true };
  }

  async requests(id: string, actor: AuthenticatedUser) {
    await this.assertManager(id, actor);
    const requests = await this.prisma.communityMembership.findMany({ where: { communityId: id, status: "PENDING" }, include: { user: { select: authorSelect } }, orderBy: { createdAt: "asc" } });
    return requests.map((request) => ({ id: request.user.id, displayName: request.user.displayName, avatarUrl: this.avatarUrl(request.user.avatarKey), createdAt: request.createdAt.toISOString() }));
  }

  async decideRequest(id: string, userId: string, actor: AuthenticatedUser, decision: "approve" | "reject") {
    await this.assertManager(id, actor);
    const key = { communityId_userId: { communityId: id, userId } };
    const request = await this.prisma.communityMembership.findUnique({ where: key });
    if (!request || request.status !== "PENDING") throw new NotFoundException("Заявка не найдена");
    if (decision === "reject") { await this.prisma.communityMembership.delete({ where: key }); return { status: "rejected" }; }
    await this.prisma.communityMembership.update({ where: key, data: { status: "APPROVED", role: "MEMBER" } });
    return { status: "approved" };
  }

  async setRole(id: string, userId: string, actor: AuthenticatedUser, role: "moderator" | "member") {
    await this.assertOwner(id, actor);
    const membership = await this.prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId } } });
    if (!membership || membership.status !== "APPROVED") throw new NotFoundException("Участник не найден");
    if (membership.role === "OWNER") throw new BadRequestException("Нельзя изменить роль владельца");
    await this.prisma.communityMembership.update({ where: { communityId_userId: { communityId: id, userId } }, data: { role: role === "moderator" ? "MODERATOR" : "MEMBER" } });
    return { id: userId, role };
  }

  async listTopics(id: string, actor: AuthenticatedUser) {
    await this.assertApproved(id, actor);
    return this.prisma.communityTopic.findMany({ where: { communityId: id }, orderBy: { createdAt: "asc" } });
  }

  async createTopic(id: string, actor: AuthenticatedUser, name: string) { await this.assertManager(id, actor); return this.prisma.communityTopic.create({ data: { communityId: id, name: name.trim() } }); }

  async listChatMessages(id: string, actor: AuthenticatedUser, topicId?: string) {
    await this.assertApproved(id, actor);
    const messages = await this.prisma.communityMessage.findMany({ where: { communityId: id, ...(topicId ? { topicId } : {}) }, orderBy: { createdAt: "desc" }, take: 100, include: { author: { select: authorSelect }, topic: true, attachment: true } });
    return messages.reverse().map((message) => this.toChatMessage(message));
  }

  async listChatMessagePage(id: string, actor: AuthenticatedUser, topicId?: string, cursor?: string) {
    await this.assertApproved(id, actor);
    const where = { communityId: id, ...(topicId ? { topicId } : {}) };
    if (cursor && !await this.prisma.communityMessage.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))
      throw new BadRequestException("Курсор сообщений не найден");
    const messages = await this.prisma.communityMessage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { author: { select: authorSelect }, topic: true, attachment: true },
    });
    const page = messages.slice(0, 50);
    return {
      items: [...page].reverse().map((message) => this.toChatMessage(message)),
      nextCursor: messages.length > 50 ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async createChatMessage(id: string, actor: AuthenticatedUser, body: string, topicId?: string, attachmentId?: string) {
    await assertNotInChaos(this.prisma, actor.id);
    await this.assertApproved(id, actor);
    if (!body.trim() && !attachmentId) throw new BadRequestException("Введите сообщение или прикрепите файл");
    if (topicId && !await this.prisma.communityTopic.findFirst({ where: { id: topicId, communityId: id } })) throw new BadRequestException("Тема не найдена");
    const message = await this.prisma.communityMessage.create({ data: { communityId: id, authorId: actor.id, body: body.trim(), topicId } });
    try {
      await this.attachments.attachToCommunityMessage(actor.id, attachmentId, message.id);
    } catch (error) {
      await this.prisma.communityMessage.delete({ where: { id: message.id } });
      throw error;
    }
    const completed = await this.prisma.communityMessage.findUniqueOrThrow({ where: { id: message.id }, include: { author: { select: authorSelect }, topic: true, attachment: true } });
    return this.toChatMessage(completed);
  }

  async createPost(id: string, actor: AuthenticatedUser, body: string) {
    await assertNotInChaos(this.prisma, actor.id);
    await this.assertApproved(id, actor);
    const post = await this.prisma.communityPost.create({ data: { communityId: id, authorId: actor.id, body: body.trim() }, include: { author: { select: authorSelect } } });
    return { id: post.id, body: post.body, createdAt: post.createdAt.toISOString(), author: { id: post.author.id, displayName: post.author.displayName, avatarUrl: this.avatarUrl(post.author.avatarKey) } };
  }

  async deletePost(id: string, postId: string, actor: AuthenticatedUser) {
    const post = await this.prisma.communityPost.findFirst({ where: { id: postId, communityId: id, deletedAt: null } });
    if (!post) throw new NotFoundException("Публикация не найдена");
    const manager = await this.isManager(id, actor);
    if (post.authorId !== actor.id && !manager) throw new ForbiddenException("Недостаточно прав для удаления публикации");
    await this.prisma.communityPost.update({ where: { id: postId }, data: { deletedAt: new Date() } });
    return { id: postId };
  }

  private async assertNoOtherApprovedMembership(userId: string, exceptCommunityId?: string) {
    const membership = await this.prisma.communityMembership.findFirst({ where: { userId, status: "APPROVED", ...(exceptCommunityId ? { communityId: { not: exceptCommunityId } } : {}) } });
    if (membership) throw new BadRequestException("Можно состоять только в одном сообществе");
  }

  private async getCommunity(id: string) {
    const community = await this.prisma.community.findUnique({ where: { id } });
    if (!community) throw new NotFoundException("Сообщество не найдено");
    return community;
  }

  private async isManager(id: string, actor: AuthenticatedUser) {
    if (actor.role === "admin") return true;
    const membership = await this.prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: actor.id } } });
    return membership?.status === "APPROVED" && (membership.role === "OWNER" || membership.role === "MODERATOR");
  }

  private async assertManager(id: string, actor: AuthenticatedUser) {
    if (!await this.isManager(id, actor)) throw new ForbiddenException("Нужны права владельца или модератора сообщества");
  }

  private async assertOwner(id: string, actor: AuthenticatedUser) {
    if (actor.role === "admin") return;
    const membership = await this.prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: actor.id } } });
    if (!membership || membership.status !== "APPROVED" || membership.role !== "OWNER") throw new ForbiddenException("Настройки доступны владельцу сообщества");
  }

  private async assertApproved(id: string, actor: AuthenticatedUser) {
    const membership = await this.prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: actor.id } } });
    if (!membership || membership.status !== "APPROVED") throw new ForbiddenException("Публикации доступны участникам сообщества");
  }

  private toChatMessage(message: any) {
    return { id: message.id, body: message.body, createdAt: message.createdAt.toISOString(), topic: message.topic ? { id: message.topic.id, name: message.topic.name } : null, attachment: message.attachment ? this.attachments.toApi(message.attachment) : null, author: { id: message.author.id, displayName: message.author.displayName, avatarUrl: this.avatarUrl(message.author.avatarKey), appearance: cosmeticAppearance(message.author.cosmetics ?? []) } };
  }

  private toSummary(item: any) {
    const membership = item.memberships?.[0];
    return { id: item.id, name: item.name, description: item.description, coverUrl: this.avatarUrl(item.coverKey ?? null), messagesLastDay: item._count?.messages ?? 0, joinPolicy: item.joinPolicy.toLowerCase(), createdById: item.createdById, createdAt: item.createdAt.toISOString(), memberCount: item._count?.memberships ?? 0, membership: membership ? { role: membership.role.toLowerCase(), status: membership.status.toLowerCase() } : null };
  }

  private avatarUrl(key: string | null) {
    return key ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + key : null;
  }
}

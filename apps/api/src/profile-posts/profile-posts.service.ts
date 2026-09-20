import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { AttachmentsService } from "../attachments/attachments.service";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

const authorSelect = { id: true, username: true, displayName: true, avatarKey: true } as const;

@Injectable()
export class ProfilePostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(profileUserId: string) {
    await this.assertProfile(profileUserId);
    const posts = await this.prisma.profilePost.findMany({
      where: { profileUserId, parentId: null, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: { select: authorSelect },
        attachment: true,
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { author: { select: authorSelect }, attachment: true },
        },
      },
    });
    return posts.map((post) => this.toApi(post));
  }

  async create(profileUserId: string, author: AuthenticatedUser, body: string, parentId?: string, attachmentId?: string) {
    await this.assertProfile(profileUserId);
    let parentAuthorId: string | undefined;
    if (parentId) {
      const parent = await this.prisma.profilePost.findFirst({ where: { id: parentId, profileUserId, deletedAt: null } });
      if (!parent) throw new NotFoundException("Исходное сообщение не найдено");
      parentAuthorId = parent.authorId;
      if (parent.parentId) throw new BadRequestException("Ответы допускаются только на исходное сообщение");
    }

    const post = await this.prisma.$transaction(async (prisma) => {
      if (attachmentId) {
        const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
        if (!attachment || attachment.createdAt.getTime() + 24 * 60 * 60 * 1000 <= Date.now()) throw new NotFoundException("Вложение не найдено или срок хранения истёк");
        if (attachment.uploaderId !== author.id) throw new ForbiddenException("Нельзя прикрепить чужой файл");
        if (attachment.kind !== "IMAGE") throw new BadRequestException("К записи можно прикрепить только изображение");
        if (attachment.profilePostId || attachment.messageId) throw new BadRequestException("Вложение уже прикреплено");
        if (attachment.status === "REJECTED") throw new BadRequestException("Вложение отклонено");
      }

      const created = await prisma.profilePost.create({ data: { profileUserId, authorId: author.id, body: body.trim(), parentId } });
      if (attachmentId) await prisma.attachment.update({ where: { id: attachmentId }, data: { profilePostId: created.id } });
      return prisma.profilePost.findUniqueOrThrow({
        where: { id: created.id },
        include: { author: { select: authorSelect }, attachment: true, replies: { include: { author: { select: authorSelect }, attachment: true } } },
      });
    });
    await this.notifications.createProfilePost(author.id, post.id, profileUserId, parentAuthorId);
    return this.toApi(post);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const post = await this.prisma.profilePost.findUnique({ where: { id } });
    if (!post || post.deletedAt) throw new NotFoundException("Сообщение не найдено");
    const allowed = post.authorId === actor.id || post.profileUserId === actor.id || actor.role !== "user";
    if (!allowed) throw new ForbiddenException("Удалить сообщение может автор, владелец профиля или модератор");
    await this.prisma.profilePost.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.attachments.removeForProfilePost(id);
    if (actor.role !== "user") {
      await this.prisma.moderationAudit.create({
        data: { actorId: actor.id, action: "PROFILE_POST_DELETE", targetUserId: post.authorId, details: { profilePostId: id } },
      });
    }
    return { id };
  }

  private async assertProfile(id: string) {
    const profile = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!profile) throw new NotFoundException("Пользователь не найден");
    return profile;
  }

  private toApi(post: any) {
    const mapAuthor = (author: any) => ({
      id: author.id,
      username: author.username,
      displayName: author.displayName,
      avatarUrl: author.avatarKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + author.avatarKey : null,
    });
    return {
      id: post.id,
      profileUserId: post.profileUserId,
      parentId: post.parentId,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
      author: mapAuthor(post.author),
      attachment: post.attachment ? this.attachments.toApi(post.attachment) : null,
      replies: (post.replies ?? []).map((reply: any) => ({
        id: reply.id,
        profileUserId: reply.profileUserId,
        parentId: reply.parentId,
        body: reply.body,
        createdAt: reply.createdAt.toISOString(),
        author: mapAuthor(reply.author),
        attachment: reply.attachment ? this.attachments.toApi(reply.attachment) : null,
        replies: [],
      })),
    };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import type { CreateCommunityDto, UpdateCommunityDto } from "./community.dto";

const authorSelect = { id: true, displayName: true, avatarKey: true } as const;

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.community.findMany({
      orderBy: { createdAt: "desc" },
      include: { memberships: { where: { userId }, select: { role: true, status: true } }, _count: { select: { memberships: { where: { status: "APPROVED" } } } } },
    });
    return items.map((item) => this.toSummary(item));
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
      members: item.memberships.filter((membership) => membership.status === "APPROVED").map((membership) => ({ id: membership.user.id, displayName: membership.user.displayName, avatarUrl: this.avatarUrl(membership.user.avatarKey), role: membership.role.toLowerCase() })),
      posts: item.posts.map((post) => ({ id: post.id, body: post.body, createdAt: post.createdAt.toISOString(), author: { id: post.author.id, displayName: post.author.displayName, avatarUrl: this.avatarUrl(post.author.avatarKey) } })),
    };
  }

  async create(actor: AuthenticatedUser, input: CreateCommunityDto) {
    const community = await this.prisma.community.create({
      data: { name: input.name, description: input.description ?? "", joinPolicy: input.joinPolicy === "approval" ? "APPROVAL" : "OPEN", createdById: actor.id, memberships: { create: { userId: actor.id, role: "OWNER", status: "APPROVED" } } },
      include: { memberships: { where: { userId: actor.id }, select: { role: true, status: true } }, _count: { select: { memberships: true } } },
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

  async createPost(id: string, actor: AuthenticatedUser, body: string) {
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

  private toSummary(item: any) {
    const membership = item.memberships?.[0];
    return { id: item.id, name: item.name, description: item.description, joinPolicy: item.joinPolicy.toLowerCase(), createdById: item.createdById, createdAt: item.createdAt.toISOString(), memberCount: item._count?.memberships ?? 0, membership: membership ? { role: membership.role.toLowerCase(), status: membership.status.toLowerCase() } : null };
  }

  private avatarUrl(key: string | null) {
    return key ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + key : null;
  }
}

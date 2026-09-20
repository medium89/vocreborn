import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { SessionRevocationService } from "../security/session-revocation.service";
import type { AuthenticatedUser } from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import type { ChangePasswordDto } from "./dto/password.dto";
import type { RegisterDto } from "./dto/register.dto";

const SESSION_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionRevocation: SessionRevocationService,
  ) {}

  async register(input: RegisterDto) {
    const passwordHash = await this.hashPassword(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          status: "OFFLINE",
          role: "USER",
        },
      });
      return this.issueSession(user.id, this.toAuthenticatedUser(user));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Этот логин уже занят");
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    const passwordMatches = user?.passwordHash ? await verify(user.passwordHash, input.password) : false;
    if (!user || !passwordMatches || user.deletedAt) throw new UnauthorizedException("Неверный логин или пароль");
    if (await this.findActiveBan(user.id)) throw new ForbiddenException("Аккаунт заблокирован");

    const authenticated = this.toAuthenticatedUser(user);
    authenticated.mutedUntil = await this.findMutedUntil(user.id);
    return this.issueSession(user.id, authenticated);
  }

  async changePassword(userId: string, input: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verify(user.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException("Текущий пароль указан неверно");
    }
    if (await verify(user.passwordHash, input.newPassword)) {
      throw new BadRequestException("Новый пароль должен отличаться от текущего");
    }

    const passwordHash = await this.hashPassword(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    this.sessionRevocation.revokeUser(user.id);
    return this.issueSession(user.id, this.toAuthenticatedUser(user));
  }

  async findByToken(token?: string): Promise<AuthenticatedUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt <= new Date() || session.user.deletedAt) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    const [ban, mutedUntil] = await Promise.all([this.findActiveBan(session.userId), this.findMutedUntil(session.userId)]);
    if (ban) return null;
    return { ...this.toAuthenticatedUser(session.user), mutedUntil };
  }

  async requireToken(token?: string) {
    const user = await this.findByToken(token);
    if (!user) throw new UnauthorizedException("Требуется вход");
    return user;
  }

  async logout(token?: string) {
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: this.hashToken(token) } });
  }

  private findActiveBan(userId: string) {
    return this.prisma.ban.findFirst({
      where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
  }

  private async findMutedUntil(userId: string) {
    const mute = await this.prisma.mute.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
    });
    return mute?.expiresAt.toISOString() ?? null;
  }

  private async issueSession(userId: string, user: AuthenticatedUser) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({ data: { userId, tokenHash: this.hashToken(token), expiresAt } });
    return { token, expiresAt, user };
  }

  private hashPassword(password: string) {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private toAuthenticatedUser(user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
    status: string;
    gender: string;
    rating?: number;
    credits?: number;
    bio?: string | null;
    avatarKey?: string | null;
    avatarThumbKey?: string | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role.toLowerCase() as AuthenticatedUser["role"],
      status: user.status.toLowerCase() as AuthenticatedUser["status"],
      gender: user.gender.toLowerCase() as AuthenticatedUser["gender"],
      mutedUntil: null,
      rating: user.rating ?? 0,
      credits: user.credits ?? 0,
      bio: user.bio ?? null,
      avatarUrl: user.avatarKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + user.avatarKey : null,
      avatarThumbnailUrl: user.avatarThumbKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + user.avatarThumbKey : null,
    };
  }
}

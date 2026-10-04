import { ChatSettingsService } from "../settings/chat-settings.service";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { SessionRevocationService } from "../security/session-revocation.service";
import type { AuthenticatedUser } from "./auth.types";
import { cosmeticAppearance } from "../gifts/cosmetics";
import type { LoginDto } from "./dto/login.dto";
import type { EmailAddressDto, EmailPasswordResetDto, EmailTokenDto, SetEmailDto } from "./dto/email.dto";
import { EmailService } from "./email.service";
import type { ChangePasswordDto, CreateRecoveryCodeDto, ResetPasswordDto } from "./dto/password.dto";
import type { RegisterDto } from "./dto/register.dto";
import { TurnstileService } from "./turnstile.service";

const RECOVERY_CODE_DAYS = 365;
const SESSION_DAYS = 30;
const VERIFY_EMAIL_HOURS = 24;
const RESET_EMAIL_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionRevocation: SessionRevocationService,
    private readonly email: EmailService,
    private readonly settings: ChatSettingsService,
    private readonly turnstile: TurnstileService,
  ) {}

  private async assertDisplayNameAvailable(displayName: string, exceptUserId?: string) {
    const existing = await this.prisma.user.findFirst({ where: { displayName: { equals: displayName.trim(), mode: "insensitive" }, deletedAt: null, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { id: true } });
    if (existing) throw new ConflictException("Отображаемое имя уже занято");
  }

  async register(input: RegisterDto) {
    const { settings } = await this.settings.read();
    if (!settings.registrationOpen || settings.maintenance) throw new ForbiddenException("Регистрация временно закрыта администратором");
    const baseUsername = input.email.split("@")[0].replace(/[^a-z0-9_]/g, "").slice(0, 32) || "user";
    const username = baseUsername === "tusova_quiz" || await this.prisma.user.findUnique({ where: { username: baseUsername } })
      ? baseUsername.slice(0, 23) + "_" + randomBytes(4).toString("hex")
      : baseUsername;
    await this.assertDisplayNameAvailable(input.displayName);
    this.email.ensureConfigured();
    const passwordHash = await this.hashPassword(input.password);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username,
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          status: "OFFLINE",
          role: "USER",
          credits: settings.initialCredits,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Этот адрес почты уже занят");
      }
      throw error;
    }
    try {
      await this.createEmailToken(user.id, input.email, "verify");
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } });
      throw error;
    }
    return this.issueSession(user.id, this.toAuthenticatedUser(user));
  }

  async registerGuest(turnstileToken: string) {
    const { settings } = await this.settings.read();
    if (!settings.registrationOpen || settings.maintenance) throw new ForbiddenException("Гостевой вход временно закрыт администратором");
    await this.turnstile.verify(turnstileToken);

    let user;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        user = await this.prisma.user.create({
          data: {
            username: "guest_" + randomBytes(8).toString("hex"),
            displayName: "Гость" + randomInt(1000, 10000),
            isGuest: true,
            status: "OFFLINE",
            role: "USER",
            credits: 0,
          },
        });
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
    if (!user) throw new BadRequestException("Не удалось создать гостевой профиль. Повторите попытку.");
    return this.issueSession(user.id, this.toAuthenticatedUser(user), 7);
  }

  async upgradeGuest(userId: string, input: RegisterDto) {
    const { settings } = await this.settings.read();
    if (!settings.registrationOpen || settings.maintenance) throw new ForbiddenException("Регистрация временно закрыта администратором");
    const guest = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!guest?.isGuest || guest.deletedAt) throw new ForbiddenException("Регистрация доступна только гостевому профилю");
    await this.assertDisplayNameAvailable(input.displayName, guest.id);
    this.email.ensureConfigured();
    const passwordHash = await this.hashPassword(input.password);

    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: guest.id },
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          isGuest: false,
          credits: settings.initialCredits,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Этот адрес почты уже занят");
      }
      throw error;
    }

    try {
      await this.createEmailToken(user.id, input.email, "verify");
    } catch (error) {
      await this.prisma.user.update({ where: { id: guest.id }, data: { email: null, displayName: guest.displayName, passwordHash: null, isGuest: true, credits: guest.credits } });
      throw error;
    }
    return this.issueSession(user.id, this.toAuthenticatedUser(user));
  }

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: input.email ? { email: input.email } : { username: input.username },
      include: { cosmetics: true },
    });
    const passwordMatches = user?.passwordHash ? await verify(user.passwordHash, input.password) : false;
    if (!user || !passwordMatches || user.deletedAt) throw new UnauthorizedException("Неверный email или пароль");
    if (await this.findActiveBan(user.id)) throw new ForbiddenException("Аккаунт заблокирован");

    const authenticated = this.toAuthenticatedUser(user);
    [authenticated.mutedUntil, authenticated.chaosUntil] = await Promise.all([this.findMutedUntil(user.id), this.findChaosUntil(user.id)]);
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
      this.prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.emailToken.deleteMany({ where: { userId: user.id, purpose: "reset" } }),
    ]);
    this.sessionRevocation.revokeUser(user.id);
    return this.issueSession(user.id, this.toAuthenticatedUser(user));
  }

  async createRecoveryCode(userId: string, input: CreateRecoveryCodeDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || user.deletedAt || !(await verify(user.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException("Текущий пароль указан неверно");
    }

    const code = "TUSOVA-" + randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + RECOVERY_CODE_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.create({ data: { userId, codeHash: this.hashToken(code), expiresAt } }),
    ]);
    return { code, expiresAt };
  }

  async resetPassword(input: ResetPasswordDto) {
    const invalidCode = new BadRequestException("Код восстановления недействителен или истёк");
    const code = await this.prisma.recoveryCode.findUnique({
      where: { codeHash: this.hashToken(input.code.trim()) },
      include: { user: true },
    });
    if (!code || code.usedAt || code.expiresAt <= new Date() || code.user.deletedAt || !code.user.passwordHash) {
      throw invalidCode;
    }
    if (await verify(code.user.passwordHash, input.newPassword)) {
      throw new BadRequestException("Новый пароль должен отличаться от прежнего");
    }

    const passwordHash = await this.hashPassword(input.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.recoveryCode.updateMany({
        where: { id: code.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidCode;
      await transaction.user.update({ where: { id: code.userId }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: code.userId } });
      await transaction.recoveryCode.deleteMany({ where: { userId: code.userId } });
      await transaction.emailToken.deleteMany({ where: { userId: code.userId, purpose: "reset" } });
    });
    this.sessionRevocation.revokeUser(code.userId);
    return { ok: true };
  }

  async setEmail(userId: string, input: SetEmailDto) {
    this.email.ensureConfigured();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || user.deletedAt || !(await verify(user.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException("Текущий пароль указан неверно");
    }
    if (user.email === input.email && user.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { email: input.email, emailVerifiedAt: null } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Этот адрес почты уже занят");
      }
      throw error;
    }
    try {
      await this.createEmailToken(userId, input.email, "verify");
    } catch (error) {
      await this.prisma.user.update({ where: { id: userId }, data: { email: user.email, emailVerifiedAt: user.emailVerifiedAt } });
      throw error;
    }
    return { ok: true, alreadyVerified: false };
  }

  async resendVerification(userId: string) {
    this.email.ensureConfigured();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.emailVerifiedAt || user.deletedAt) {
      throw new BadRequestException("Нет адреса, ожидающего подтверждения");
    }
    await this.createEmailToken(user.id, user.email, "verify");
    return { ok: true };
  }

  async verifyEmail(input: EmailTokenDto) {
    const invalid = new BadRequestException("Ссылка подтверждения недействительна или истекла");
    const token = await this.prisma.emailToken.findUnique({ where: { tokenHash: this.hashToken(input.token) }, include: { user: true } });
    if (!token || token.purpose !== "verify" || token.usedAt || token.expiresAt <= new Date() || token.user.deletedAt || !token.user.email) throw invalid;
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.emailToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalid;
      await transaction.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
      await transaction.emailToken.deleteMany({ where: { userId: token.userId, purpose: "verify" } });
    });
    return { ok: true };
  }

  async requestEmailReset(input: EmailAddressDto) {
    this.email.ensureConfigured();
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user?.emailVerifiedAt && !user.deletedAt && user.passwordHash) {
      const recent = await this.prisma.emailToken.findFirst({
        where: { userId: user.id, purpose: "reset", createdAt: { gt: new Date(Date.now() - 60 * 1000) } },
      });
      if (!recent) {
        try {
          await this.createEmailToken(user.id, input.email, "reset");
        } catch {
          // Keep the response identical for known and unknown addresses.
        }
      }
    }
    return { ok: true };
  }

  async resetPasswordByEmail(input: EmailPasswordResetDto) {
    const invalid = new BadRequestException("Ссылка восстановления недействительна или истекла");
    const token = await this.prisma.emailToken.findUnique({ where: { tokenHash: this.hashToken(input.token) }, include: { user: true } });
    if (!token || token.purpose !== "reset" || token.usedAt || token.expiresAt <= new Date() || token.user.deletedAt || !token.user.emailVerifiedAt || !token.user.passwordHash) throw invalid;
    if (await verify(token.user.passwordHash, input.newPassword)) {
      throw new BadRequestException("Новый пароль должен отличаться от прежнего");
    }
    const passwordHash = await this.hashPassword(input.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.emailToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalid;
      await transaction.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: token.userId } });
      await transaction.recoveryCode.deleteMany({ where: { userId: token.userId } });
      await transaction.emailToken.deleteMany({ where: { userId: token.userId } });
    });
    this.sessionRevocation.revokeUser(token.userId);
    return { ok: true };
  }

  private async createEmailToken(userId: string, address: string, purpose: "verify" | "reset") {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + (purpose === "verify" ? VERIFY_EMAIL_HOURS * 60 : RESET_EMAIL_MINUTES) * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { userId, purpose } }),
      this.prisma.emailToken.create({ data: { userId, purpose, tokenHash: this.hashToken(token), expiresAt } }),
    ]);
    await this.email.sendLink(address, purpose, token);
  }

  async findByToken(token?: string): Promise<AuthenticatedUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: { include: { cosmetics: true } } },
    });
    if (!session || session.expiresAt <= new Date() || session.user.deletedAt) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    const [ban, mutedUntil, chaosUntil] = await Promise.all([this.findActiveBan(session.userId), this.findMutedUntil(session.userId), this.findChaosUntil(session.userId)]);
    if (ban) return null;
    return { ...this.toAuthenticatedUser(session.user), mutedUntil, chaosUntil };
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

  private async findChaosUntil(userId: string) {
    const chaos = await this.prisma.chaos.findFirst({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "desc" },
    });
    return chaos?.expiresAt.toISOString() ?? null;
  }

  private async issueSession(userId: string, user: AuthenticatedUser, days = SESSION_DAYS) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
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
    email?: string | null;
    emailVerifiedAt?: Date | null;
    role: string;
    isDj?: boolean;
    isGuest?: boolean;
    status: string;
    gender: string;
    rating?: number;
    credits?: number;
    bio?: string | null;
    avatarKey?: string | null;
    avatarThumbKey?: string | null;
    cosmetics?: Array<{ effectKey: string; settings: Prisma.JsonValue }>;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role.toLowerCase() as AuthenticatedUser["role"],
      isDj: Boolean(user.isDj),
      isGuest: Boolean(user.isGuest),
      email: user.email ?? null,
      emailVerified: Boolean(user.emailVerifiedAt),
      status: user.status.toLowerCase() as AuthenticatedUser["status"],
      gender: user.gender.toLowerCase() as AuthenticatedUser["gender"],
      mutedUntil: null,
      chaosUntil: null,
      rating: user.rating ?? 0,
      credits: user.credits ?? 0,
      bio: user.bio ?? null,
      avatarUrl: user.avatarKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + user.avatarKey : null,
      avatarThumbnailUrl: user.avatarThumbKey ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + user.avatarThumbKey : null,
      appearance: cosmeticAppearance(user.cosmetics ?? []),
    };
  }
}

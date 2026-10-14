import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ChatSettingsService } from "../settings/chat-settings.service";
import type { AuthenticatedUser } from "./auth.types";
import { AuthService } from "./auth.service";
import { EmailService } from "./email.service";

export const OAUTH_PROVIDERS = ["google", "yandex", "vk", "mail", "telegram"] as const;
export type OAuthProvider = typeof OAUTH_PROVIDERS[number];
type ProviderProfile = { subject: string; email: string | null; emailVerified: boolean };
const FLOW_MINUTES = 10;

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function token() { return randomBytes(32).toString("base64url"); }
function providerOf(value: string): OAuthProvider {
  if (!OAUTH_PROVIDERS.includes(value as OAuthProvider)) throw new BadRequestException("Неизвестный способ входа");
  return value as OAuthProvider;
}
function key() {
  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  const value = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (value.length !== 32) throw new ServiceUnavailableException("Для OAuth требуется OAUTH_ENCRYPTION_KEY (32 байта в base64)");
  return value;
}
function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}
function decrypt(value: string) {
  const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !body) throw new ServiceUnavailableException("Секрет OAuth повреждён");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
function origin(name: "WEB_ORIGIN" | "PUBLIC_API_URL", fallback: string) {
  const value = process.env[name] ?? fallback;
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new ServiceUnavailableException(name + " настроен неверно");
  return url.origin;
}
async function jsonResponse(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000), headers: { Accept: "application/json", ...init.headers } });
  if (!response.ok) throw new BadRequestException("Провайдер отклонил вход (" + response.status + ")");
  const data = await response.json() as Record<string, any>;
  if (data.error) throw new BadRequestException("Провайдер отклонил вход");
  return data;
}
function requiredSubject(value: unknown) {
  const subject = String(value ?? "");
  if (!subject || subject.length > 255) throw new BadRequestException("Провайдер не вернул ID пользователя");
  return subject;
}
function cleanEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ChatSettingsService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
  ) {}

  callbackUrl(provider: OAuthProvider) {
    return origin("PUBLIC_API_URL", "http://localhost:3001") + "/api/auth/oauth/" + provider + "/callback";
  }
  webUrl(params: Record<string, string>) {
    const url = new URL(origin("WEB_ORIGIN", "http://localhost:3000"));
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return url.toString();
  }
  async publicProviders() {
    const configs = await this.prisma.authProviderConfig.findMany();
    const ready = Boolean(process.env.OAUTH_ENCRYPTION_KEY && Buffer.from(process.env.OAUTH_ENCRYPTION_KEY, "base64").length === 32);
    return OAUTH_PROVIDERS.map((provider) => ({ provider, enabled: ready && Boolean(configs.find((item) => item.provider === provider && item.enabled && item.clientId && item.secretEncrypted)) }));
  }
  async adminProviders(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const configs = await this.prisma.authProviderConfig.findMany();
    return OAUTH_PROVIDERS.map((provider) => {
      const item = configs.find((row) => row.provider === provider);
      return { provider, enabled: Boolean(item?.enabled), clientId: item?.clientId ?? "", hasSecret: Boolean(item?.secretEncrypted), callbackUrl: this.callbackUrl(provider) };
    });
  }
  async saveProvider(actor: AuthenticatedUser, providerName: string, input: { enabled: boolean; clientId: string; clientSecret?: string }) {
    this.requireAdmin(actor);
    const provider = providerOf(providerName);
    const clientId = input.clientId.trim();
    if (!clientId || clientId.length > 255) throw new BadRequestException("Укажите ID приложения");
    const existing = await this.prisma.authProviderConfig.findUnique({ where: { provider } });
    const secret = input.clientSecret?.trim();
    if (!secret && !existing?.secretEncrypted) throw new BadRequestException("Укажите секрет приложения");
    if (secret && secret.length > 2048) throw new BadRequestException("Секрет приложения слишком длинный");
    key();
    await this.prisma.$transaction(async (tx) => {
      await tx.authProviderConfig.upsert({
        where: { provider },
        create: { provider, clientId, secretEncrypted: secret ? encrypt(secret) : existing!.secretEncrypted, enabled: input.enabled },
        update: { clientId, enabled: input.enabled, ...(secret ? { secretEncrypted: encrypt(secret) } : {}) },
      });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "AUTH_PROVIDER_EDIT", details: { provider, enabled: input.enabled, clientId, secretRotated: Boolean(secret) } } });
    });
    return this.adminProviders(actor);
  }
  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
  }
  private async configured(provider: OAuthProvider) {
    const config = await this.prisma.authProviderConfig.findUnique({ where: { provider } });
    if (!config?.enabled || !config.clientId || !config.secretEncrypted) throw new ForbiddenException("Этот способ входа пока не настроен");
    return { clientId: config.clientId, secret: decrypt(config.secretEncrypted) };
  }
  async linked(actor: AuthenticatedUser) {
    return (await this.prisma.socialIdentity.findMany({ where: { userId: actor.id }, select: { provider: true } })).map((item) => item.provider);
  }
  async start(providerName: string, sessionToken?: string, link = false) {
    const provider = providerOf(providerName);
    const config = await this.configured(provider);
    const linkUser = link ? await this.auth.findByToken(sessionToken) : null;
    if (link && !linkUser) throw new UnauthorizedException("Для привязки войдите в свой аккаунт");
    const state = token();
    const verifier = token();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    await this.prisma.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.oAuthAttempt.create({ data: { tokenHash: hash(state), provider, kind: "state", codeVerifier: verifier, linkUserId: linkUser?.id, expiresAt: new Date(Date.now() + FLOW_MINUTES * 60000) } });
    const callback = this.callbackUrl(provider);
    const endpoints: Record<OAuthProvider, [string, string]> = {
      google: ["https://accounts.google.com/o/oauth2/v2/auth", "openid email profile"],
      yandex: ["https://oauth.yandex.ru/authorize", "login:info login:email"],
      vk: ["https://id.vk.com/authorize", "email"],
      mail: ["https://oauth.mail.ru/login", "userinfo"],
      telegram: ["https://oauth.telegram.org/auth", "openid profile"],
    };
    const [endpoint, scope] = endpoints[provider];
    const url = new URL(endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scope);
    if (provider !== "mail") {
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", provider === "vk" ? "s256" : "S256");
    }
    if (provider === "telegram") url.searchParams.set("nonce", state);
    return { state, url: url.toString() };
  }
  async callback(providerName: string, input: { state?: string; code?: string; device_id?: string; error?: string }, cookie?: string, sessionToken?: string) {
    const provider = providerOf(providerName);
    if (input.error) throw new BadRequestException("Вход отменён у провайдера");
    const state = input.state ?? "";
    if (!state || !cookie || !this.same(state, cookie) || !input.code) throw new UnauthorizedException("Сеанс входа истёк; начните заново");
    const attempt = await this.prisma.oAuthAttempt.findUnique({ where: { tokenHash: hash(state) } });
    if (!attempt || attempt.kind !== "state" || attempt.provider !== provider || attempt.expiresAt <= new Date() || !attempt.codeVerifier)
      throw new UnauthorizedException("Сеанс входа истёк; начните заново");
    const claimed = await this.prisma.oAuthAttempt.deleteMany({ where: { id: attempt.id, kind: "state" } });
    if (claimed.count !== 1) throw new UnauthorizedException("Ссылка входа уже использована");
    const config = await this.configured(provider);
    const profile = await this.exchange(provider, input.code, input.device_id, state, attempt.codeVerifier, config);
    const identity = await this.prisma.socialIdentity.findUnique({ where: { provider_subject: { provider, subject: profile.subject } } });
    if (attempt.linkUserId) {
      const linkedUser = await this.auth.findByToken(sessionToken);
      if (!linkedUser || linkedUser.id !== attempt.linkUserId) throw new UnauthorizedException("Сеанс привязки истёк");
      if (identity && identity.userId !== linkedUser.id) throw new ConflictException("Этот аккаунт провайдера уже привязан к другому пользователю");
      if (!identity) await this.prisma.socialIdentity.create({ data: { provider, subject: profile.subject, userId: linkedUser.id } });
      return { linked: true };
    }
    if (identity) return { session: await this.auth.createSocialSession(identity.userId) };
    const pending = token();
    await this.prisma.oAuthAttempt.create({ data: { tokenHash: hash(pending), provider, kind: "setup", subject: profile.subject, email: profile.email, emailVerified: profile.emailVerified, expiresAt: new Date(Date.now() + FLOW_MINUTES * 60000) } });
    return { pending };
  }
  async pending(cookie?: string) {
    const attempt = cookie ? await this.prisma.oAuthAttempt.findUnique({ where: { tokenHash: hash(cookie) } }) : null;
    if (!attempt || attempt.kind !== "setup" || attempt.expiresAt <= new Date()) throw new UnauthorizedException("Сеанс регистрации истёк");
    const suggestedTag = (attempt.email?.split("@")[0] ?? attempt.provider + "_" + attempt.subject).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) || "user";
    return { provider: attempt.provider, email: attempt.email, emailVerified: attempt.emailVerified, suggestedTag };
  }
  async complete(cookie: string | undefined, input: { email: string; displayName: string; username: string }) {
    const attempt = cookie ? await this.prisma.oAuthAttempt.findUnique({ where: { tokenHash: hash(cookie) } }) : null;
    if (!attempt || attempt.kind !== "setup" || attempt.expiresAt <= new Date() || !attempt.subject) throw new UnauthorizedException("Сеанс регистрации истёк");
    const email = cleanEmail(input.email);
    if (!email) throw new BadRequestException("Введите корректный адрес почты");
    if (attempt.emailVerified && attempt.email !== email) throw new BadRequestException("Адрес должен совпадать с подтверждённой почтой провайдера");
    if (input.username === "tusova_quiz") throw new ConflictException("Этот тег зарезервирован");
    const displayName = input.displayName.trim();
    const username = input.username.trim().toLowerCase();
    if (displayName.length < 2 || displayName.length > 64 || !/^[a-z0-9_]{3,32}$/.test(username))
      throw new BadRequestException("Проверьте ник и тег");
    const { settings } = await this.settings.read();
    if (!settings.registrationOpen || settings.maintenance) throw new ForbiddenException("Регистрация временно закрыта");
    const duplicateName = await this.prisma.user.findFirst({ where: { displayName: { equals: displayName, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
    if (duplicateName) throw new ConflictException("Отображаемое имя уже занято");
    if (!attempt.emailVerified) this.email.ensureConfigured();
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(164824916)`;
        const claim = await tx.oAuthAttempt.deleteMany({ where: { id: attempt.id, kind: "setup", expiresAt: { gt: new Date() } } });
        if (claim.count !== 1) throw new UnauthorizedException("Сеанс регистрации уже использован");
        const eligible = (await tx.user.count({ where: { earlyUserRewardGranted: true } })) < 100;
        const created = await tx.user.create({ data: {
          email, emailVerifiedAt: attempt.emailVerified ? new Date() : null,
          username, displayName, status: "OFFLINE", role: "USER",
          credits: settings.initialCredits + (eligible ? 5000 : 0), earlyUserRewardGranted: eligible,
        } });
        await tx.socialIdentity.create({ data: { provider: attempt.provider, subject: attempt.subject!, userId: created.id } });
        if (eligible) await tx.economyEntry.create({ data: { userId: created.id, type: "EARLY_USER_REWARD", creditsDelta: 5000, balanceAfter: created.credits, referenceKey: "early-user-reward:" + created.id } });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Адрес почты или тег уже занят. Если это ваш аккаунт, войдите по паролю и привяжите соцсеть.");
      throw error;
    }
    if (!attempt.emailVerified) {
      try { await this.auth.sendSocialEmailVerification(user.id, email); }
      catch { /* Account exists; verification can be resent from profile. */ }
    }
    const session = await this.auth.createSocialSession(user.id);
    return { ...session, user: { ...session.user, earlyUserRewardJustGranted: user.earlyUserRewardGranted } };
  }
  private same(a: string, b: string) {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
  private async exchange(provider: OAuthProvider, code: string, deviceId: string | undefined, state: string, verifier: string, config: { clientId: string; secret: string }): Promise<ProviderProfile> {
    const redirect_uri = this.callbackUrl(provider);
    if (provider === "vk") {
      if (!deviceId) throw new BadRequestException("VK ID не вернул device_id");
      const url = new URL("https://id.vk.com/oauth2/auth");
      for (const [k, v] of Object.entries({ grant_type: "authorization_code", redirect_uri, client_id: config.clientId, code_verifier: verifier, state, device_id: deviceId })) url.searchParams.set(k, v);
      const result = await jsonResponse(url.toString(), { method: "POST", body: new URLSearchParams({ code }) });
      if (result.state !== state || !result.access_token) throw new BadRequestException("Ответ VK ID недействителен");
      const info = await jsonResponse("https://id.vk.com/oauth2/user_info?client_id=" + encodeURIComponent(config.clientId), { method: "POST", body: new URLSearchParams({ access_token: result.access_token }) });
      const user = info.user ?? info;
      return { subject: requiredSubject(user.user_id ?? user.id), email: cleanEmail(result.email ?? user.email), emailVerified: false };
    }
    const tokenEndpoints = { google: "https://oauth2.googleapis.com/token", yandex: "https://oauth.yandex.ru/token", mail: "https://oauth.mail.ru/token", telegram: "https://oauth.telegram.org/token" } as const;
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri, client_id: config.clientId });
    if (provider !== "mail") body.set("code_verifier", verifier);
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (provider === "telegram") headers.Authorization = "Basic " + Buffer.from(config.clientId + ":" + config.secret).toString("base64");
    else body.set("client_secret", config.secret);
    const result = await jsonResponse(tokenEndpoints[provider], { method: "POST", headers, body });
    if (provider === "telegram") return this.telegramProfile(result.id_token, config.clientId, state);
    if (!result.access_token) throw new BadRequestException("Провайдер не выдал токен");
    if (provider === "google") {
      const info = await jsonResponse("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: "Bearer " + result.access_token } });
      return { subject: requiredSubject(info.sub), email: cleanEmail(info.email), emailVerified: info.email_verified === true };
    }
    if (provider === "yandex") {
      const info = await jsonResponse("https://login.yandex.ru/info?format=json", { headers: { Authorization: "OAuth " + result.access_token } });
      return { subject: requiredSubject(info.id), email: cleanEmail(info.default_email), emailVerified: false };
    }
    const info = await jsonResponse("https://oauth.mail.ru/userinfo", { headers: { Authorization: "Bearer " + result.access_token } });
    return { subject: requiredSubject(info.id), email: cleanEmail(info.email), emailVerified: false };
  }
  private async telegramProfile(idToken: unknown, clientId: string, nonce: string): Promise<ProviderProfile> {
    if (typeof idToken !== "string") throw new BadRequestException("Telegram не вернул ID-токен");
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new BadRequestException("ID-токен Telegram повреждён");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, any>;
    if (!["RS256", "ES256"].includes(header.alg ?? "") || !header.kid) throw new BadRequestException("Алгоритм Telegram не поддерживается");
    const jwks = await jsonResponse("https://oauth.telegram.org/.well-known/jwks.json");
    const jwk = (jwks.keys as Array<Record<string, unknown>> | undefined)?.find((item) => item.kid === header.kid);
    if (!jwk) throw new BadRequestException("Ключ Telegram не найден");
    const signature = Buffer.from(parts[2], "base64url");
    const options = header.alg === "ES256" ? { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" as const } : createPublicKey({ key: jwk, format: "jwk" });
    if (!verifySignature("sha256", Buffer.from(parts[0] + "." + parts[1]), options, signature)) throw new UnauthorizedException("Подпись Telegram недействительна");
    if (claims.iss !== "https://oauth.telegram.org" || String(claims.aud) !== clientId || typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now() || claims.nonce !== nonce)
      throw new UnauthorizedException("ID-токен Telegram недействителен");
    return { subject: requiredSubject(claims.sub), email: null, emailVerified: false };
  }
}

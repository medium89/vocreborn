import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, RadioPayment, RadioRequestStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { assertNotInChaos } from "../moderation/chaos.guard";

const active: RadioRequestStatus[] = ["WAITING", "ACCEPTED", "PLAYING"];
const directory = resolve(process.env.RADIO_STORAGE_DIR ?? "storage/radio");
type WorkerStatus = { active: boolean; epoch: string | null; trackId: string | null; completedId: string | null; result: "completed" | "failed" | "skipped" | null };
type Order = { artist: string; title: string; note?: string; uploadId?: string; idempotencyKey: string; expectedPrice: number; studio?: boolean };

@Injectable()
export class RadioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadioService.name);
  private timer?: NodeJS.Timeout;
  private cycling = false;
  private initialized?: Promise<unknown>;
  constructor(private readonly prisma: PrismaService) {}
  get enabled() { return process.env.TUSOVA_RADIO_ENABLED === "true"; }
  private configured() {
    if (!this.enabled || !process.env.RADIO_WORKER_URL || !process.env.RADIO_WORKER_TOKEN) throw new ServiceUnavailableException("Радио ещё не подключено администратором");
  }
  private async ensure() {
    this.configured();
    this.initialized ??= this.prisma.radioBroadcast.upsert({ where: { id: "main" }, create: { id: "main", price: 5 }, update: {} }).catch(error => { this.initialized = undefined; throw error; });
    await this.initialized;
  }
  onModuleInit() {
    if (this.enabled) {
      this.timer = setInterval(() => void this.cycle().catch(() => this.logger.warn("Не удалось синхронизировать радио")), 3000);
      this.timer.unref();
    }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async worker<T>(path: string, data?: unknown): Promise<T> {
    this.configured();
    try {
      const response = await fetch(process.env.RADIO_WORKER_URL + path, { method: data === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + process.env.RADIO_WORKER_TOKEN, "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(6000) });
      if (response.status === 400 && path === "/probe") throw new BadRequestException("Используйте MP3, WAV, FLAC, Ogg, M4A или WebM: до 25 МБ и 15 минут, без видео");
      if (!response.ok) throw new Error("worker unavailable");
      return await response.json() as T;
    } catch (error) { if (error instanceof BadRequestException) throw error; throw new ServiceUnavailableException("Аудиосервис недоступен. Попробуйте позже"); }
  }
  private async dj(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, role: true, isDj: true } });
    const ban = await this.prisma.ban.findFirst({ where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (!user || ban || (!user.isDj && user.role !== "ADMIN")) throw new ForbiddenException("Нужны права DJ или администратора");
    return user;
  }
  private async lock(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM radio_broadcasts WHERE id = 'main' FOR UPDATE`;
    return tx.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
  }
  private async host(actor: AuthenticatedUser) {
    await this.ensure(); await this.dj(actor.id);
    const state = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
    if (!state.epoch || state.hostId !== actor.id) throw new ForbiddenException("Сначала займите эфир в студии DJ");
    return state;
  }
  async status() {
    if (!this.enabled) return { enabled: false, live: false, accepting: false, price: 5, host: null, track: null, streamUrl: null };
    await this.ensure();
    const state = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" }, include: { host: { select: { id: true, displayName: true } } } });
    const audio = await this.worker<WorkerStatus>("/status").catch(() => null);
    const live = Boolean(state.epoch && audio?.active && audio.epoch === state.epoch);
    const track = state.currentId ? await this.prisma.radioRequest.findUnique({ where: { id: state.currentId }, select: { id: true, artist: true, title: true } }) : null;
    return { enabled: true, live, accepting: live && state.accepting, price: state.price, host: state.host, track, streamUrl: live ? "/radio-stream/live.mp3" : null };
  }
  async start(actor: AuthenticatedUser) {
    await this.ensure(); await this.dj(actor.id);
    const epoch = randomUUID();
    const claimed = await this.prisma.$transaction(async tx => {
      const current = await this.lock(tx);
      if (current.hostId) {
        if (current.hostId === actor.id) return current;
        throw new ConflictException("Эфир уже занят другим DJ");
      }
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "RADIO_START", details: { epoch } } });
      return tx.radioBroadcast.update({ where: { id: "main" }, data: { hostId: actor.id, epoch, accepting: false, startedAt: new Date(), currentId: null } });
    });
    try { await this.worker("/start", { epoch: claimed.epoch }); }
    catch (error) { await this.finish(claimed.epoch!, "Эфир не удалось запустить"); throw error; }
    return this.status();
  }
  async stop(actor: AuthenticatedUser) {
    await this.ensure(); await this.dj(actor.id);
    const state = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
    if (state.hostId !== actor.id && actor.role !== "admin") throw new ForbiddenException("Остановить чужой эфир может только администратор");
    if (state.epoch) await this.finish(state.epoch, "DJ завершил эфир", actor.id);
    return this.status();
  }
  private async settle(tx: Prisma.TransactionClient, id: string, status: RadioRequestStatus, decision: string, charge = false) {
    const request = await tx.radioRequest.findUniqueOrThrow({ where: { id } });
    const changed = await tx.radioRequest.updateMany({ where: { id, status: { in: active }, payment: "HELD" }, data: { status, decision, payment: charge ? "CHARGED" : "REFUNDED" } });
    if (!changed.count) return;
    const user = await tx.user.update({ where: { id: request.userId }, data: charge ? {} : { credits: { increment: request.price } }, select: { credits: true } });
    await tx.economyEntry.create({ data: { userId: request.userId, type: charge ? "RADIO_CHARGE" : "RADIO_REFUND", creditsDelta: charge ? 0 : request.price, balanceAfter: user.credits, referenceKey: "radio:" + id + (charge ? ":charge" : ":refund") } });
  }
  private async finish(epoch: string, reason: string, actorId?: string) {
    // Fencing: stop only this epoch; an old request cannot terminate a newer broadcast.
    await this.worker("/stop", { epoch }).catch(() => undefined);
    await this.prisma.$transaction(async tx => {
      const state = await this.lock(tx);
      const pending = await tx.radioRequest.findMany({ where: { epoch, status: { in: active } }, select: { id: true } });
      for (const item of pending) await this.settle(tx, item.id, "CANCELLED", reason);
      if (state.epoch === epoch) await tx.radioBroadcast.update({ where: { id: "main" }, data: { hostId: null, epoch: null, currentId: null, accepting: false, startedAt: null } });
      if (actorId) await tx.moderationAudit.create({ data: { actorId, action: "RADIO_STOP", details: { reason } } });
    });
  }
  async settings(actor: AuthenticatedUser, input: { accepting?: boolean; price?: number }) {
    await this.ensure();
    if (input.price !== undefined && actor.role !== "admin") throw new ForbiddenException("Цену меняет только администратор");
    if (input.accepting !== undefined) await this.host(actor);
    if (actor.role !== "admin") await this.dj(actor.id);
    await this.prisma.$transaction(async tx => {
      const state = await this.lock(tx);
      if (input.accepting !== undefined && state.hostId !== actor.id) throw new ConflictException("Ведущий уже изменился");
      await tx.radioBroadcast.update({ where: { id: "main" }, data: input });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "RADIO_SETTINGS", details: input } });
    });
    return this.status();
  }
  async setDj(actor: AuthenticatedUser, userId: string, enabled: boolean) {
    if (actor.role !== "admin") throw new ForbiddenException("DJ назначает только администратор");
    await this.prisma.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null, isBot: false, isGuest: false } });
      if (!user) throw new NotFoundException("Зарегистрированный пользователь не найден");
      await tx.user.update({ where: { id: userId }, data: { isDj: enabled } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, targetUserId: userId, action: "DJ_CHANGE", details: { from: user.isDj, to: enabled } } });
    });
    if (!enabled && this.enabled) {
      await this.ensure();
      const state = await this.prisma.radioBroadcast.findUnique({ where: { id: "main" } });
      if (state?.hostId === userId && state.epoch) await this.finish(state.epoch, "Права DJ сняты", actor.id);
    }
    return { id: userId, isDj: enabled };
  }
  async upload(actor: AuthenticatedUser, file?: { buffer: Buffer; size: number; originalname: string; mimetype: string }) {
    await this.ensure(); await assertNotInChaos(this.prisma, actor.id);
    if (!file || !file.size || file.size > 25 * 1024 * 1024) throw new BadRequestException("Аудиофайл должен быть не больше 25 МБ");
    const count = await this.prisma.radioUpload.count({ where: { userId: actor.id, expiresAt: { gt: new Date() }, storageKey: { not: null } } });
    if (count >= 5) throw new BadRequestException("Можно хранить не больше пяти аудиофайлов одновременно");
    const key = randomUUID() + ".audio";
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, key), file.buffer, { flag: "wx", mode: 0o640 });
    try {
      const probe = await this.worker<{ duration: number; mimeType: string }>("/probe", { key });
      const row = await this.prisma.$transaction(async tx => {
        await this.lock(tx);
        if (await tx.radioUpload.count({ where: { userId: actor.id, expiresAt: { gt: new Date() }, storageKey: { not: null } } }) >= 5) throw new BadRequestException("Можно хранить не больше пяти аудиофайлов одновременно");
        return tx.radioUpload.create({ data: { userId: actor.id, storageKey: key, originalName: file.originalname.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 150) || "audio", size: file.size, mimeType: probe.mimeType, duration: probe.duration, expiresAt: new Date(Date.now() + 3600_000) } });
      });
      return { id: row.id, originalName: row.originalName, duration: row.duration, expiresAt: row.expiresAt };
    } catch (error) { await unlink(join(directory, key)).catch(() => undefined); throw error; }
  }
  async file(actor: AuthenticatedUser, id: string) {
    await this.ensure();
    const upload = await this.prisma.radioUpload.findUnique({ where: { id }, include: { request: { select: { epoch: true } } } });
    if (!upload?.storageKey || upload.expiresAt <= new Date()) throw new NotFoundException("Срок хранения аудиофайла истёк");
    if (upload.userId !== actor.id && actor.role !== "admin") {
      await this.dj(actor.id);
      const state = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
      if (state.hostId !== actor.id || !upload.request || upload.request.epoch !== state.epoch) throw new ForbiddenException("Файл доступен только автору и ведущему назначенного эфира");
    }
    return { path: join(directory, upload.storageKey), mimeType: upload.mimeType };
  }
  async order(actor: AuthenticatedUser, input: Order) {
    await this.ensure(); await assertNotInChaos(this.prisma, actor.id);
    const previous = await this.prisma.radioRequest.findUnique({ where: { userId_idempotencyKey: { userId: actor.id, idempotencyKey: input.idempotencyKey } } });
    if (previous) return previous;
    if (input.studio) await this.host(actor);
    const audio = await this.worker<WorkerStatus>("/status");
    return this.prisma.$transaction(async tx => {
      const state = await this.lock(tx);
      const previous = await tx.radioRequest.findUnique({ where: { userId_idempotencyKey: { userId: actor.id, idempotencyKey: input.idempotencyKey } } });
      if (previous) return previous;
      if (!audio.active || audio.epoch !== state.epoch) throw new ConflictException("Эфир сейчас недоступен");
      if (!state.epoch || (!input.studio && !state.accepting)) throw new ConflictException("Приём заказов закрыт");
      if (input.studio && state.hostId !== actor.id) throw new ForbiddenException("Студия другого ведущего");
      if (!input.studio && state.price !== input.expectedPrice) throw new ConflictException("Цена изменилась. Обновите страницу и подтвердите новую цену");
      const amount = input.studio ? 0 : state.price;
      if (await tx.radioRequest.count({ where: { userId: actor.id, studio: Boolean(input.studio), status: { in: active } } }) >= (input.studio ? 50 : 3)) throw new BadRequestException("Слишком много активных заказов");
      const upload = input.uploadId ? await tx.radioUpload.findUnique({ where: { id: input.uploadId }, include: { request: { select: { id: true } } } }) : null;
      if (input.uploadId && (!upload?.storageKey || upload.userId !== actor.id || upload.expiresAt <= new Date() || upload.request)) throw new BadRequestException("Аудиофайл недоступен или уже используется");
      if (input.studio && !upload) throw new BadRequestException("Для плейлиста DJ нужен аудиофайл");
      const changed = await tx.user.updateMany({ where: { id: actor.id, credits: { gte: amount }, deletedAt: null }, data: { credits: { decrement: amount } } });
      if (!changed.count) throw new BadRequestException("Недостаточно кредитов");
      const row = await tx.radioRequest.create({ data: { userId: actor.id, epoch: state.epoch, idempotencyKey: input.idempotencyKey, artist: input.artist, title: input.title, note: input.note ?? "", studio: Boolean(input.studio), price: amount, uploadId: upload?.id, status: input.studio ? "ACCEPTED" : "WAITING", expiresAt: upload?.expiresAt ?? new Date(Date.now() + 3600_000) } });
      const balance = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { credits: true } });
      await tx.economyEntry.create({ data: { userId: actor.id, type: "RADIO_RESERVE", creditsDelta: -amount, balanceAfter: balance.credits, referenceKey: "radio:" + row.id + ":reserve" } });
      return row;
    });
  }
  async mine(actor: AuthenticatedUser) {
    await this.ensure();
    const orders = await this.prisma.radioRequest.findMany({ where: { userId: actor.id, studio: false }, orderBy: { createdAt: "desc" }, take: 50, include: { upload: { select: { id: true, originalName: true, expiresAt: true } } } });
    const balance = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { credits: true, rating: true } });
    return { orders, balance };
  }
  async queue() {
    await this.ensure();
    return this.prisma.radioRequest.findMany({ where: { status: { in: active }, studio: false }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, artist: true, title: true, status: true, createdAt: true } });
  }
  async studio(actor: AuthenticatedUser) {
    await this.ensure(); await this.dj(actor.id);
    const state = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
    if (state.hostId && state.hostId !== actor.id && actor.role !== "admin") throw new ForbiddenException("Эфир ведёт другой DJ");
    const scope: Prisma.RadioRequestWhereInput = actor.role === "admin" ? {} : state.epoch && state.hostId === actor.id ? { epoch: state.epoch } : { userId: actor.id, studio: true };
    return this.prisma.radioRequest.findMany({ where: { ...scope, OR: [{ status: { in: active } }, { updatedAt: { gt: new Date(Date.now() - 3600_000) } }] }, orderBy: { createdAt: "desc" }, take: 150, include: { user: { select: { id: true, displayName: true } }, upload: { select: { id: true, originalName: true, duration: true, expiresAt: true, storageKey: true } } } }).then(rows => rows.map(row => ({ ...row, upload: row.upload ? { id: row.upload.id, originalName: row.upload.originalName, duration: row.upload.duration, expiresAt: row.upload.expiresAt, available: Boolean(row.upload.storageKey && row.upload.expiresAt > new Date()) } : null })));
  }
  async decide(actor: AuthenticatedUser, id: string, action: "accept" | "reject" | "cancel" | "attach", reason: string, uploadId?: string) {
    await this.ensure();
    if (action !== "cancel") await this.host(actor);
    await this.prisma.$transaction(async tx => {
      const state = await this.lock(tx);
      const row = await tx.radioRequest.findUnique({ where: { id } });
      if (!row) throw new NotFoundException("Заказ не найден");
      if (action === "cancel" && row.userId !== actor.id) throw new ForbiddenException("Можно отменить только свой заказ");
      if (action !== "cancel" && (state.hostId !== actor.id || state.epoch !== row.epoch)) throw new ForbiddenException("Этот заказ не относится к вашему эфиру");
      if (!active.includes(row.status)) return;
      if (row.status === "PLAYING") throw new ConflictException("Трек уже в эфире. DJ может пропустить его кнопкой «Следующий»");
      if (action === "accept") {
        if (row.status !== "WAITING") return;
        await tx.radioRequest.update({ where: { id }, data: { status: "ACCEPTED" } });
      } else if (action === "attach") {
        const upload = uploadId ? await tx.radioUpload.findUnique({ where: { id: uploadId }, include: { request: true } }) : null;
        if (!upload?.storageKey || upload.userId !== actor.id || upload.request || upload.expiresAt <= new Date()) throw new BadRequestException("Файл DJ недоступен");
        await tx.radioRequest.update({ where: { id }, data: { uploadId: upload.id, expiresAt: upload.expiresAt } });
      } else await this.settle(tx, id, action === "cancel" ? "CANCELLED" : "REJECTED", reason || "Заказ отменён");
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "RADIO_REQUEST", details: { id, action, reason } } });
    });
    return { ok: true };
  }
  async skip(actor: AuthenticatedUser) {
    const state = await this.host(actor);
    if (state.currentId) {
      await this.worker("/skip", { epoch: state.epoch });
      await this.prisma.$transaction(async tx => {
        const fresh = await this.lock(tx);
        if (fresh.epoch !== state.epoch || fresh.currentId !== state.currentId) return;
        await this.settle(tx, state.currentId!, "REJECTED", "DJ пропустил трек; кредиты возвращены");
        await tx.radioBroadcast.update({ where: { id: "main" }, data: { currentId: null } });
      });
    }
    await this.cycle(); return { ok: true };
  }
  async cycle() {
    if (!this.enabled || this.cycling) return;
    this.cycling = true;
    try {
      await this.ensure();
      const state = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
      if (state.hostId && state.epoch) {
        try { await this.dj(state.hostId); }
        catch { await this.finish(state.epoch, "Ведущий больше не имеет доступа к эфиру"); return; }
        const audio = await this.worker<WorkerStatus>("/heartbeat", { epoch: state.epoch }).catch(() => null);
        if (!audio?.active || audio.epoch !== state.epoch) { await this.finish(state.epoch, "Эфир прерван; кредиты возвращены"); return; }
        if (state.currentId && audio.completedId === state.currentId) {
          await this.prisma.$transaction(async tx => {
            const fresh = await this.lock(tx);
            if (fresh.epoch !== state.epoch || fresh.currentId !== state.currentId) return;
            const completed = audio.result === "completed";
            await this.settle(tx, state.currentId!, completed ? "COMPLETED" : "REJECTED", completed ? "Трек прозвучал в эфире" : "Не удалось исполнить трек; кредиты возвращены", completed);
            await tx.radioBroadcast.update({ where: { id: "main" }, data: { currentId: null } });
          });
        }
      }
      await this.prisma.$transaction(async tx => {
        await this.lock(tx);
        const expired = await tx.radioRequest.findMany({ where: { status: { in: ["WAITING", "ACCEPTED"] }, expiresAt: { lte: new Date() } }, select: { id: true } });
        for (const row of expired) await this.settle(tx, row.id, "EXPIRED", "Срок ожидания истёк; кредиты возвращены");
      });
      await this.cleanup();
      const fresh = await this.prisma.radioBroadcast.findUniqueOrThrow({ where: { id: "main" } });
      if (!fresh.epoch || fresh.currentId) return;
      const next = await this.prisma.$transaction(async tx => {
        const latest = await this.lock(tx);
        if (latest.epoch !== fresh.epoch || latest.currentId) return null;
        const row = await tx.radioRequest.findFirst({ where: { epoch: latest.epoch!, status: "ACCEPTED", expiresAt: { gt: new Date() }, upload: { storageKey: { not: null }, expiresAt: { gt: new Date() } } }, orderBy: { createdAt: "asc" }, include: { upload: true } });
        if (!row) return null;
        await tx.radioRequest.update({ where: { id: row.id }, data: { status: "PLAYING" } });
        await tx.radioBroadcast.update({ where: { id: "main" }, data: { currentId: row.id } });
        return row;
      });
      if (next) {
        try { await this.worker("/play", { epoch: fresh.epoch, trackId: next.id, key: next.upload!.storageKey }); }
        catch { await this.finish(fresh.epoch, "Ошибка запуска аудиопотока"); }
      }
    } finally { this.cycling = false; }
  }
  private async cleanup() {
    const expired = await this.prisma.radioUpload.findMany({ where: { storageKey: { not: null }, expiresAt: { lte: new Date() } }, take: 100 });
    for (const row of expired) {
      await unlink(join(directory, row.storageKey!)).catch(() => undefined);
      await this.prisma.radioUpload.update({ where: { id: row.id }, data: { storageKey: null } });
    }
    // Also remove orphan files left by a crash between disk write and DB commit.
    for (const key of await readdir(directory).catch(() => [] as string[])) {
      if (!/^[a-f0-9-]{36}\.audio$/.test(key)) continue;
      const info = await stat(join(directory, key)).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 3600_000 && !await this.prisma.radioUpload.findFirst({ where: { storageKey: key } })) await unlink(join(directory, key)).catch(() => undefined);
    }
  }
}


import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Attachment, AttachmentKind } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

type UploadFile = { buffer: Buffer; mimetype: string; size: number; originalname: string };
const DAY_MS = 24 * 60 * 60 * 1000;
const formats: Record<string, { extension: string; kind: AttachmentKind; maxSize: number }> = {
  "image/png": { extension: ".png", kind: "IMAGE", maxSize: 5 * 1024 * 1024 },
  "image/jpeg": { extension: ".jpg", kind: "IMAGE", maxSize: 5 * 1024 * 1024 },
  "image/webp": { extension: ".webp", kind: "IMAGE", maxSize: 5 * 1024 * 1024 },
  "audio/mpeg": { extension: ".mp3", kind: "AUDIO", maxSize: 8 * 1024 * 1024 },
  "audio/ogg": { extension: ".ogg", kind: "AUDIO", maxSize: 8 * 1024 * 1024 },
  "audio/wav": { extension: ".wav", kind: "AUDIO", maxSize: 8 * 1024 * 1024 },
  "audio/x-wav": { extension: ".wav", kind: "AUDIO", maxSize: 8 * 1024 * 1024 },
  "audio/webm": { extension: ".webm", kind: "AUDIO", maxSize: 8 * 1024 * 1024 },
};

@Injectable()
export class AttachmentsService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.cleanupExpired();
    this.cleanupTimer = setInterval(() => void this.cleanupExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async upload(userId: string, file?: UploadFile) {
    if (!file) throw new BadRequestException("Файл не передан");
    const format = formats[file.mimetype];
    if (!format) throw new BadRequestException("Разрешены только PNG, JPEG, WebP, MP3, OGG, WAV и WebM");
    if (file.size > format.maxSize) throw new BadRequestException(format.kind === "IMAGE" ? "Изображение должно быть не больше 5 МБ" : "Аудио должно быть не больше 8 МБ");
    if (!this.signatureMatches(file.mimetype, file.buffer)) throw new BadRequestException("Содержимое файла не соответствует заявленному формату");

    const directory = join(process.cwd(), "storage", "attachments");
    await mkdir(directory, { recursive: true });
    const storageKey = this.generatedName(format.kind, format.extension);
    let previewStorageKey: string | null = null;
    await writeFile(join(directory, storageKey), file.buffer, { flag: "wx" });
    if (format.kind === "IMAGE") {
      previewStorageKey = storageKey.replace(/\.[^.]+$/, "_preview.webp");
      try {
        const preview = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(240, 240, { fit: "inside", withoutEnlargement: true }).webp({ quality: 72, effort: 4 }).toBuffer();
        await writeFile(join(directory, previewStorageKey), preview, { flag: "wx" });
      } catch {
        await unlink(join(directory, storageKey)).catch(() => undefined);
        throw new BadRequestException("Не удалось создать миниатюру изображения");
      }
    }

    const attachment = await this.prisma.attachment.create({
      data: { uploaderId: userId, kind: format.kind, status: "APPROVED", reviewedAt: new Date(), mimeType: file.mimetype, originalName: storageKey, storageKey, previewStorageKey, size: file.size },
    });
    return this.toApi(attachment);
  }

  async attachToMessage(userId: string, attachmentId: string | undefined, messageId: string) {
    if (!attachmentId) return;
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || this.isExpired(attachment)) throw new NotFoundException("Вложение не найдено или срок хранения истёк");
    if (attachment.uploaderId !== userId) throw new ForbiddenException("Нельзя прикрепить чужой файл");
    if (attachment.messageId) throw new BadRequestException("Вложение уже прикреплено");
    if (attachment.status === "REJECTED") throw new BadRequestException("Вложение отклонено");
    await this.prisma.attachment.update({ where: { id: attachment.id }, data: { messageId } });
  }

  async attachToCommunityMessage(userId: string, attachmentId: string | undefined, messageId: string) {
    if (!attachmentId) return;
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || this.isExpired(attachment)) throw new NotFoundException("Вложение не найдено или срок хранения истёк");
    if (attachment.uploaderId !== userId) throw new ForbiddenException("Нельзя прикрепить чужой файл");
    if (attachment.messageId || attachment.profilePostId || attachment.communityMessageId) throw new BadRequestException("Вложение уже прикреплено");
    if (attachment.status === "REJECTED") throw new BadRequestException("Вложение отклонено");
    await this.prisma.attachment.update({ where: { id: attachment.id }, data: { communityMessageId: messageId } });
  }

  async removeForProfilePost(profilePostId: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { profilePostId } });
    if (attachment) await this.deleteAttachment(attachment);
  }

  async listPending(actor: AuthenticatedUser) {
    this.requireModerator(actor);
    const items = await this.prisma.attachment.findMany({ where: { status: "PENDING", createdAt: { gte: new Date(Date.now() - DAY_MS) } }, orderBy: { createdAt: "asc" }, include: { uploader: { select: { id: true, username: true, displayName: true } }, message: { select: { id: true, body: true, roomId: true } } } });
    return items.map((item) => ({ ...this.toApi(item, item.message?.roomId), uploader: item.uploader, message: item.message }));
  }

  async review(actor: AuthenticatedUser, id: string, status: "APPROVED" | "REJECTED") {
    this.requireModerator(actor);
    const attachment = await this.prisma.attachment.findUnique({ where: { id }, include: { message: { select: { roomId: true } } } });
    if (!attachment) throw new NotFoundException("Вложение не найдено");
    const updated = await this.prisma.$transaction(async (prisma) => {
      const value = await prisma.attachment.update({ where: { id }, data: { status, reviewedAt: new Date() } });
      await prisma.moderationAudit.create({ data: { actorId: actor.id, action: status === "APPROVED" ? "ATTACHMENT_APPROVE" : "ATTACHMENT_REJECT", messageId: attachment.messageId, targetUserId: attachment.uploaderId, details: { attachmentId: id, mimeType: attachment.mimeType, size: attachment.size } } });
      return value;
    });
    if (status === "REJECTED") await this.deleteFiles(updated);
    return this.toApi(updated, attachment.message?.roomId);
  }

  async readContent(actor: AuthenticatedUser, id: string, preview = false) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id }, include: { message: { select: { roomId: true } } } });
    if (!attachment) throw new NotFoundException("Вложение не найдено");
    if (this.isExpired(attachment, attachment.message?.roomId)) {
      await this.deleteAttachment(attachment);
      throw new NotFoundException("Срок хранения вложения истёк");
    }
    const privileged = actor.role === "admin" || actor.role === "moderator";
    if (attachment.status === "REJECTED") throw new NotFoundException("Вложение отклонено");
    if (attachment.status !== "APPROVED" && attachment.uploaderId !== actor.id && !privileged) throw new ForbiddenException("Вложение ещё не прошло проверку");
    const key = preview ? attachment.previewStorageKey : attachment.storageKey;
    if (!key) throw new NotFoundException("Миниатюра не найдена");
    try {
      const buffer = await readFile(this.filePath(key));
      return { attachment, buffer, mimeType: preview ? "image/webp" : attachment.mimeType };
    } catch {
      throw new NotFoundException("Файл вложения не найден");
    }
  }

  async cleanupExpired() {
    const expired = await this.prisma.attachment.findMany({ where: { profilePostId: null, communityMessageId: null, createdAt: { lt: new Date(Date.now() - DAY_MS) }, OR: [{ messageId: null }, { message: { is: { roomId: { not: null } } } }] } });
    for (const attachment of expired) await this.deleteAttachment(attachment);
    return expired.length;
  }

  toApi(attachment: Attachment, roomId?: string | null) {
    return { id: attachment.id, kind: attachment.kind.toLowerCase() as "image" | "audio", status: attachment.status.toLowerCase() as "pending" | "approved" | "rejected", mimeType: attachment.mimeType, originalName: attachment.originalName, size: attachment.size, url: "/api/attachments/" + attachment.id + "/content", previewUrl: attachment.previewStorageKey ? "/api/attachments/" + attachment.id + "/preview" : undefined, createdAt: attachment.createdAt.toISOString(), expiresAt: this.expiresAfterDay(attachment, roomId) ? new Date(attachment.createdAt.getTime() + DAY_MS).toISOString() : undefined };
  }

  private generatedName(kind: AttachmentKind, extension: string) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIME_ZONE ?? "Asia/Barnaul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
    const timestamp = value("year") + value("month") + value("day") + "_" + value("hour") + value("minute") + value("second");
    const suffix = randomBytes(2).toString("base64url").replace(/[^a-z0-9]/gi, "").slice(0, 2).toLowerCase().padEnd(2, "x");
    return (kind === "IMAGE" ? "picture_" : "audio_") + timestamp + "_" + suffix + extension;
  }

  private expiresAfterDay(attachment: Attachment, roomId?: string | null) {
    if (attachment.profilePostId || attachment.communityMessageId) return false;
    if (attachment.messageId) return roomId !== null;
    return true;
  }
  private isExpired(attachment: Attachment, roomId?: string | null) {
    return this.expiresAfterDay(attachment, roomId) && attachment.createdAt.getTime() + DAY_MS <= Date.now();
  }
  private async deleteFiles(attachment: Attachment) { await unlink(this.filePath(attachment.storageKey)).catch(() => undefined); if (attachment.previewStorageKey) await unlink(this.filePath(attachment.previewStorageKey)).catch(() => undefined); }
  private async deleteAttachment(attachment: Attachment) { await this.deleteFiles(attachment); await this.prisma.attachment.delete({ where: { id: attachment.id } }).catch(() => undefined); }
  private filePath(storageKey: string) { return join(process.cwd(), "storage", "attachments", storageKey); }
  private requireModerator(actor: AuthenticatedUser) { if (actor.role === "user") throw new ForbiddenException("Недостаточно полномочий"); }

  private signatureMatches(mime: string, buffer: Buffer) {
    const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const webp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    const mp3 = buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    const ogg = buffer.subarray(0, 4).toString("ascii") === "OggS";
    const wav = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
    const webm = buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    return (mime === "image/png" && png) || (mime === "image/jpeg" && jpeg) || (mime === "image/webp" && webp) || (mime === "audio/mpeg" && mp3) || (mime === "audio/ogg" && ogg) || ((mime === "audio/wav" || mime === "audio/x-wav") && wav) || (mime === "audio/webm" && webm);
  }
}

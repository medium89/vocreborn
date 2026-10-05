import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DailyActivityAction, Gender } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { PrismaService } from "../database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EconomyService } from "../gifts/economy.service";
import { cosmeticAppearance } from "../gifts/cosmetics";
import type { Prisma } from "@prisma/client";
import { NotificationType } from "@prisma/client";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
type AvatarFile = { buffer: Buffer; mimetype: string; size: number };

function hasValidImageSignature(file: AvatarFile) {
  const png = file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const webp = file.buffer.subarray(0, 4).toString("ascii") === "RIFF" && file.buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return (file.mimetype === "image/png" && png) || (file.mimetype === "image/jpeg" && jpeg) || (file.mimetype === "image/webp" && webp);
}

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly economy: EconomyService) {}

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        cosmetics: true,
        photoAlbums: { orderBy: { createdAt: "asc" }, include: { photos: { orderBy: { createdAt: "asc" } } } },
        receivedGifts: { orderBy: { createdAt: "desc" }, take: 100, include: { gift: true, sender: { select: { id: true, displayName: true } } } },
        communityMemberships: { where: { status: "APPROVED" }, include: { community: true } },
        memberships: { include: { room: { select: { id: true, name: true } } } },
        _count: { select: { messages: true, profilePosts: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return {
      ...this.toProfile(user),
      albums: user.photoAlbums.map((album) => this.toAlbum(album)),
      gifts: user.receivedGifts.map((item) => ({ id: item.id, createdAt: item.createdAt.toISOString(), message: item.message, gift: { id: item.gift.id, name: item.giftName, description: item.giftDescription, emoji: item.giftEmoji, price: item.giftPrice, categoryId: item.gift.categoryId, imageUrl: item.gift.imageKey }, sender: item.sender ? { id: item.sender.id, displayName: item.sender.displayName } : null })),
      communities: user.communityMemberships.map((membership) => ({ id: membership.community.id, name: membership.community.name, role: membership.role.toLowerCase() })),
      rooms: user.memberships.map((membership) => ({ id: membership.room.id, name: membership.room.name })),
      stats: { messages: user._count.messages, profilePosts: user._count.profilePosts },
    };
  }
  async listFriends(userId: string) {
    const exists = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException("Пользователь не найден");
    const select = { id: true, username: true, displayName: true, avatarKey: true, status: true, role: true, hideRole: true, hideDj: true, isDj: true, gender: true, deletedAt: true } as const;
    const links = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: "desc" },
      include: { userA: { select }, userB: { select } },
    });
    const baseUrl = process.env.PUBLIC_API_URL ?? "http://localhost:3001";
    return links.flatMap((link) => {
      const friend = link.userAId === userId ? link.userB : link.userA;
      if (friend.deletedAt) return [];
      return [{
        id: friend.id, username: friend.username, displayName: friend.displayName,
        avatarUrl: friend.avatarKey ? baseUrl + friend.avatarKey : null,
        isDj: friend.isDj, hideRole: friend.hideRole, hideDj: friend.hideDj, status: friend.status.toLowerCase(), role: friend.role.toLowerCase(), gender: friend.gender.toLowerCase(),
        friendsSince: link.createdAt.toISOString(),
      }];
    });
  }

  async addFriend(userId: string, friendId: string) {
    if (userId === friendId) throw new BadRequestException("Нельзя добавить себя в друзья");
    const friend = await this.prisma.user.findFirst({ where: { id: friendId, deletedAt: null }, select: { id: true } });
    if (!friend) throw new NotFoundException("Пользователь не найден");
    const [userAId, userBId] = [userId, friendId].sort();
    await this.prisma.friendship.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
    });
    return { friendId, added: true };
  }

  async removeFriend(userId: string, friendId: string) {
    if (userId === friendId) throw new BadRequestException("Нельзя удалить себя из друзей");
    const [userAId, userBId] = [userId, friendId].sort();
    await this.prisma.friendship.deleteMany({ where: { userAId, userBId } });
    return { friendId, added: false };
  }


  async update(userId: string, input: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { bio: input.bio === undefined ? undefined : input.bio || null, gender: input.gender ? input.gender.toUpperCase() as Gender : undefined, hideRole: input.hideRole === undefined ? undefined : input.hideRole, hideDj: input.hideDj === undefined ? undefined : input.hideDj },
    });
    return this.toProfile(user);
  }

  async saveAvatar(userId: string, file?: AvatarFile) {
    if (!file) throw new BadRequestException("Файл аватара не передан");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) throw new BadRequestException("Допустимы PNG, JPEG и WebP");
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException("Исходное изображение должно быть не больше 10 МБ");
    if (!hasValidImageSignature(file)) throw new BadRequestException("Содержимое файла не соответствует формату изображения");

    let avatar: Buffer | undefined;
    try {
      for (const dimension of [1600, 1280, 1024]) {
        for (const quality of [84, 72, 60, 48]) {
          const encoded = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(dimension, dimension, { fit: "inside", withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer();
          if (encoded.length <= MAX_AVATAR_BYTES) { avatar = encoded; break; }
        }
        if (avatar) break;
      }
    } catch {
      throw new BadRequestException("Не удалось обработать изображение аватара");
    }
    if (!avatar) throw new BadRequestException("Не удалось сжать аватар до 2 МБ");

    const preview = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(240, 240, { fit: "cover", position: "centre" }).webp({ quality: 72, effort: 4 }).toBuffer().catch(() => { throw new BadRequestException("Не удалось создать превью аватара"); });
    const directory = join(process.cwd(), "uploads", "avatars");
    const id = randomUUID();
    const filename = id + ".webp";
    const previewFilename = id + "-preview.webp";
    await mkdir(directory, { recursive: true });
    await Promise.all([writeFile(join(directory, filename), avatar), writeFile(join(directory, previewFilename), preview)]);

    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: "/uploads/avatars/" + filename, avatarThumbKey: "/uploads/avatars/" + previewFilename } });
    return this.toProfile(user);
  }

  async listAlbums(userId: string) {
    const albums = await this.prisma.photoAlbum.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, include: { photos: { orderBy: { createdAt: "asc" } } } });
    return albums.map((album) => this.toAlbum(album));
  }

  async createAlbum(userId: string, rawTitle: string) {
    const title = rawTitle.trim();
    if (title.length < 1 || title.length > 80) throw new BadRequestException("Название альбома должно содержать от 1 до 80 символов");
    const [count, vip] = await Promise.all([this.prisma.photoAlbum.count({ where: { userId } }), this.prisma.userCosmetic.findUnique({ where: { userId_effectKey: { userId, effectKey: "vip" } } })]);
    const limit = vip ? 5 : 2;
    if (count >= limit) throw new BadRequestException("Можно создать не более " + limit + " фотоальбомов");
    const album = await this.prisma.photoAlbum.create({ data: { userId, title }, include: { photos: true } });
    return this.toAlbum(album);
  }

  async deleteAlbum(userId: string, albumId: string) {
    const album = await this.prisma.photoAlbum.findFirst({ where: { id: albumId, userId }, include: { photos: true } });
    if (!album) throw new NotFoundException("Фотоальбом не найден");
    await this.prisma.photoAlbum.delete({ where: { id: album.id } });
    await Promise.all(album.photos.flatMap((photo) => [unlink(join(process.cwd(), photo.storageKey.slice(1))).catch(() => undefined), unlink(join(process.cwd(), photo.thumbnailKey.slice(1))).catch(() => undefined)]));
  }

  async uploadAlbumPhoto(userId: string, albumId: string, file?: AvatarFile & { originalname?: string }) {
    if (!file) throw new BadRequestException("Фотография не передана");
    if (!hasValidImageSignature(file)) throw new BadRequestException("Допустимы PNG, JPEG и WebP");
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException("Исходное изображение должно быть не больше 10 МБ");
    const album = await this.prisma.photoAlbum.findFirst({ where: { id: albumId, userId }, include: { _count: { select: { photos: true } } } });
    if (!album) throw new NotFoundException("Фотоальбом не найден");
    const vip = await this.prisma.userCosmetic.findUnique({ where: { userId_effectKey: { userId, effectKey: "vip" } } });
    const limit = vip ? 30 : 10;
    if (album._count.photos >= limit) throw new BadRequestException("В одном фотоальбоме может быть не более " + limit + " фотографий");
    let image: Buffer; let thumbnail: Buffer;
    try {
      image = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toBuffer();
      thumbnail = await sharp(file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(420, 420, { fit: "cover", position: "centre" }).webp({ quality: 76, effort: 4 }).toBuffer();
    } catch { throw new BadRequestException("Не удалось обработать фотографию"); }
    const directory = join(process.cwd(), "uploads", "albums"); const id = randomUUID(); const filename = id + ".webp"; const thumbFilename = id + "-thumb.webp";
    await mkdir(directory, { recursive: true });
    await Promise.all([writeFile(join(directory, filename), image), writeFile(join(directory, thumbFilename), thumbnail)]);
    try {
      const photo = await this.prisma.albumPhoto.create({ data: { albumId: album.id, originalName: file.originalname?.slice(0, 255) || "Фотография.webp", storageKey: "/uploads/albums/" + filename, thumbnailKey: "/uploads/albums/" + thumbFilename, size: image.length } });
      return this.toAlbumPhoto(photo);
    } catch (error) { await Promise.all([unlink(join(directory, filename)).catch(() => undefined), unlink(join(directory, thumbFilename)).catch(() => undefined)]); throw error; }
  }

  async deleteAlbumPhoto(userId: string, albumId: string, photoId: string) {
    const photo = await this.prisma.albumPhoto.findFirst({ where: { id: photoId, albumId, album: { userId } } });
    if (!photo) throw new NotFoundException("Фотография не найдена");
    await this.prisma.albumPhoto.delete({ where: { id: photo.id } });
    await Promise.all([unlink(join(process.cwd(), photo.storageKey.slice(1))).catch(() => undefined), unlink(join(process.cwd(), photo.thumbnailKey.slice(1))).catch(() => undefined)]);
  }

  async togglePhotoLike(userId: string, photoId: string) {
    const photo = await this.prisma.albumPhoto.findUnique({ where: { id: photoId }, include: { album: true } });
    if (!photo) throw new NotFoundException("Фотография не найдена");
    const existing = await this.prisma.photoLike.findUnique({ where: { photoId_userId: { photoId, userId } } });
    if (existing) { await this.prisma.photoLike.delete({ where: { id: existing.id } }); await this.prisma.notification.deleteMany({ where: { userId: photo.album.userId, actorId: userId, photoId, type: NotificationType.PHOTO_LIKE } }); return { liked: false }; }
    await this.prisma.photoLike.create({ data: { photoId, userId } });
    await this.notifications.createEvent({ userId: photo.album.userId, actorId: userId, type: NotificationType.PHOTO_LIKE, photoId });
    const reward = photo.album.userId === userId ? null : await this.economy.awardDailyActivity(userId, DailyActivityAction.PHOTO_LIKE);
    return { liked: true, reward };
  }

  async commentPhoto(userId: string, photoId: string, body: string) {
    const text = body.trim(); if (!text || text.length > 500) throw new BadRequestException("Комментарий должен содержать от 1 до 500 символов");
    const photo = await this.prisma.albumPhoto.findUnique({ where: { id: photoId }, include: { album: true } }); if (!photo) throw new NotFoundException("Фотография не найдена");
    const comment = await this.prisma.photoComment.create({ data: { photoId, authorId: userId, body: text } });
    await this.notifications.createEvent({ userId: photo.album.userId, actorId: userId, type: NotificationType.PHOTO_COMMENT, photoId, metadata: { preview: text } });
    return { id: comment.id, body: comment.body, createdAt: comment.createdAt.toISOString() };
  }

  private toAlbumPhoto(photo: { id: string; originalName: string; storageKey: string; thumbnailKey: string; size: number; createdAt: Date }) {
    const baseUrl = process.env.PUBLIC_API_URL ?? "http://localhost:3001";
    return { id: photo.id, originalName: photo.originalName, url: baseUrl + photo.storageKey, thumbnailUrl: baseUrl + photo.thumbnailKey, size: photo.size, createdAt: photo.createdAt.toISOString() };
  }

  private toAlbum(album: { id: string; title: string; createdAt: Date; photos: Array<{ id: string; originalName: string; storageKey: string; thumbnailKey: string; size: number; createdAt: Date }> }) {
    return { id: album.id, title: album.title, createdAt: album.createdAt.toISOString(), photos: album.photos.map((photo) => this.toAlbumPhoto(photo)) };
  }
  private toProfile(user: { isDj?: boolean; hideRole?: boolean; hideDj?: boolean; id: string; username: string; displayName: string; bio: string | null; avatarKey: string | null; avatarThumbKey: string | null; role: string; status: string; gender: string; rating: number; createdAt: Date; cosmetics?: Array<{ effectKey: string; settings: Prisma.JsonValue }> }) {
    const baseUrl = process.env.PUBLIC_API_URL ?? "http://localhost:3001";
    return { id: user.id, isDj: Boolean(user.isDj), hideRole: Boolean(user.hideRole), hideDj: Boolean(user.hideDj), username: user.username, displayName: user.displayName, bio: user.bio, avatarUrl: user.avatarKey ? baseUrl + user.avatarKey : null, avatarThumbnailUrl: user.avatarThumbKey ? baseUrl + user.avatarThumbKey : null, role: user.role.toLowerCase(), status: user.status.toLowerCase(), gender: user.gender.toLowerCase(), rating: user.rating, createdAt: user.createdAt.toISOString(), appearance: cosmeticAppearance(user.cosmetics ?? []) };
  }
}

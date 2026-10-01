import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import type { StoreCategoryDto, StoreProductDto } from "./store-editor.dto";

type ImageFile = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class StoreEditorService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(actor: AuthenticatedUser) {
    if (actor.role !== "admin") throw new ForbiddenException("Требуются права администратора");
  }

  private imageUrl(key: string | null) {
    return key ? (process.env.PUBLIC_API_URL ?? "http://localhost:3001") + key : null;
  }

  private categoryView(category: { id: string; name: string; description: string; icon: string; imageKey: string | null; active: boolean; position: number; createdAt: Date }) {
    return { id: category.id, name: category.name, description: category.description, icon: category.icon, imageUrl: this.imageUrl(category.imageKey), active: category.active, position: category.position, createdAt: category.createdAt.toISOString() };
  }

  private productView(product: { id: string; categoryId: string; name: string; description: string; emoji: string; kind: string; effectKey: string | null; imageKey: string | null; price: number; active: boolean; position: number; createdAt: Date }) {
    return { id: product.id, categoryId: product.categoryId, name: product.name, description: product.description, emoji: product.emoji, kind: product.kind, effectKey: product.effectKey, imageKey: product.imageKey, imageUrl: product.imageKey, price: product.price, active: product.active, position: product.position, createdAt: product.createdAt.toISOString() };
  }

  async publicCategories() {
    const categories = await this.prisma.storeCategory.findMany({ where: { active: true, deletedAt: null }, orderBy: [{ position: "asc" }, { name: "asc" }] });
    return categories.map((category) => this.categoryView(category));
  }

  async catalog(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const [categories, products] = await Promise.all([
      this.prisma.storeCategory.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
      this.prisma.giftCatalog.findMany({ where: { deletedAt: null }, orderBy: [{ categoryId: "asc" }, { position: "asc" }, { name: "asc" }] }),
    ]);
    return { categories: categories.map((category) => this.categoryView(category)), products: products.map((product) => this.productView(product)) };
  }

  async createCategory(actor: AuthenticatedUser, input: StoreCategoryDto) {
    this.requireAdmin(actor);
    const id = randomUUID();
    const category = await this.prisma.$transaction(async (tx) => {
      const created = await tx.storeCategory.create({ data: { id, ...input } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_CATEGORY_CREATE", details: { categoryId: id, fields: { ...input } } } });
      return created;
    });
    return this.categoryView(category);
  }

  async updateCategory(actor: AuthenticatedUser, id: string, input: StoreCategoryDto) {
    this.requireAdmin(actor);
    const current = await this.getCategory(id);
    const category = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.storeCategory.update({ where: { id }, data: input });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_CATEGORY_UPDATE", details: { categoryId: id, before: { name: current.name, description: current.description, icon: current.icon, active: current.active, position: current.position }, after: { ...input } } } });
      return updated;
    });
    return this.categoryView(category);
  }

  async deleteCategory(actor: AuthenticatedUser, id: string) {
    this.requireAdmin(actor);
    const category = await this.getCategory(id);
    const products = await this.prisma.giftCatalog.count({ where: { categoryId: id, deletedAt: null } });
    if (products) throw new BadRequestException("Сначала перенесите или удалите товары этой категории");
    await this.prisma.$transaction(async (tx) => {
      await tx.storeCategory.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_CATEGORY_DELETE", details: { categoryId: id, name: category.name } } });
    });
    await this.removeStoredImage(category.imageKey);
    return { id, deleted: true };
  }

  private async getCategory(id: string) {
    const category = await this.prisma.storeCategory.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException("Категория не найдена");
    return category;
  }

  private async encodeImage(file?: ImageFile, size = 800, fit: "inside" | "cover" = "inside") {
    if (!file) throw new BadRequestException("Изображение не передано");
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException("Изображение должно быть не больше 5 МБ");
    const png = file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpeg = file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const webp = file.buffer.subarray(0, 4).toString("ascii") === "RIFF" && file.buffer.subarray(8, 12).toString("ascii") === "WEBP";
    if (!((file.mimetype === "image/png" && png) || (file.mimetype === "image/jpeg" && jpeg) || (file.mimetype === "image/webp" && webp)))
      throw new BadRequestException("Допустимы изображения PNG, JPEG и WebP");
    try {
      return await sharp(file.buffer, { failOn: "error", limitInputPixels: 30_000_000 }).rotate().resize(size, size, { fit, withoutEnlargement: fit === "inside" }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException("Не удалось обработать изображение");
    }
  }

  private async removeStoredImage(key: string | null) {
    if (!key?.startsWith("/uploads/store-categories/")) return;
    await unlink(join(process.cwd(), "uploads", "store-categories", basename(key))).catch(() => undefined);
  }

  async uploadCategoryImage(actor: AuthenticatedUser, id: string, file?: ImageFile) {
    this.requireAdmin(actor);
    const category = await this.getCategory(id);
    const image = await this.encodeImage(file);
    const directory = join(process.cwd(), "uploads", "store-categories");
    const key = "/uploads/store-categories/" + randomUUID() + ".webp";
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, basename(key)), image);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.storeCategory.update({ where: { id }, data: { imageKey: key } });
        await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_CATEGORY_IMAGE", details: { categoryId: id, imageKey: key } } });
        return next;
      });
      await this.removeStoredImage(category.imageKey);
      return this.categoryView(updated);
    } catch (error) {
      await this.removeStoredImage(key);
      throw error;
    }
  }

  async deleteCategoryImage(actor: AuthenticatedUser, id: string) {
    this.requireAdmin(actor);
    const category = await this.getCategory(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.storeCategory.update({ where: { id }, data: { imageKey: null } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_CATEGORY_IMAGE_REMOVE", details: { categoryId: id } } });
      return next;
    });
    await this.removeStoredImage(category.imageKey);
    return this.categoryView(updated);
  }

  async createProduct(actor: AuthenticatedUser, input: StoreProductDto) {
    this.requireAdmin(actor);
    await this.getCategory(input.categoryId);
    if (input.kind === "cosmetic" && !input.effectKey) throw new BadRequestException("Укажите эффект товара");
    const id = randomUUID();
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.giftCatalog.create({ data: { id, ...input, effectKey: input.kind === "cosmetic" ? input.effectKey : null, imageKey: input.imageKey || null } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_PRODUCT_CREATE", details: { productId: id, fields: { ...input } } } });
      return created;
    });
    return this.productView(product);
  }

  async updateProduct(actor: AuthenticatedUser, id: string, input: StoreProductDto) {
    this.requireAdmin(actor);
    const current = await this.prisma.giftCatalog.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException("Товар не найден");
    await this.getCategory(input.categoryId);
    if (input.kind === "cosmetic" && !input.effectKey) throw new BadRequestException("Укажите эффект товара");
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.giftCatalog.update({ where: { id }, data: { ...input, effectKey: input.kind === "cosmetic" ? input.effectKey : null, imageKey: input.imageKey || null } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_PRODUCT_UPDATE", details: { productId: id, before: { categoryId: current.categoryId, name: current.name, description: current.description, emoji: current.emoji, price: current.price, active: current.active, position: current.position }, after: { ...input } } } });
      return updated;
    });
    return this.productView(product);
  }

  async deleteProduct(actor: AuthenticatedUser, id: string) {
    this.requireAdmin(actor);
    const product = await this.prisma.giftCatalog.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException("Товар не найден");
    await this.prisma.$transaction(async (tx) => {
      await tx.giftCatalog.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
      await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_PRODUCT_DELETE", details: { productId: id, name: product.name } } });
    await this.removeProductImage(product.imageKey);
    });
    return { id, deleted: true };
  }

  private async removeProductImage(key: string | null) {
    if (!key?.startsWith("/uploads/store-products/")) return;
    await unlink(join(process.cwd(), "uploads", "store-products", basename(key))).catch(() => undefined);
  }

  private async saveProductImage(file?: ImageFile) {
    const image = await this.encodeImage(file, 400, "cover");
    const directory = join(process.cwd(), "uploads", "store-products");
    const key = "/uploads/store-products/" + randomUUID() + ".webp";
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, basename(key)), image);
    return key;
  }

  async uploadProductImage(actor: AuthenticatedUser, id: string, file?: ImageFile) {
    this.requireAdmin(actor);
    const product = await this.prisma.giftCatalog.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException("Товар не найден");
    const key = await this.saveProductImage(file);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.giftCatalog.update({ where: { id }, data: { imageKey: key } });
        await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_PRODUCT_IMAGE", details: { productId: id, imageKey: key } } });
        return next;
      });
      await this.removeProductImage(product.imageKey);
      return this.productView(updated);
    } catch (error) {
      await this.removeProductImage(key);
      throw error;
    }
  }

  private parseBatchProducts(value: unknown, expectedCount: number) {
    if (typeof value !== "string") throw new BadRequestException("Передайте JSON с товарами");
    let raw: unknown;
    try { raw = JSON.parse(value); } catch { throw new BadRequestException("JSON с товарами содержит ошибку"); }
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) throw new BadRequestException("Можно добавить от 1 до 50 товаров за раз");
    if (raw.length !== expectedCount) throw new BadRequestException("Число товаров в JSON должно совпадать с числом изображений");
    return raw.map((item, index) => {
      if (!item || typeof item !== "object") throw new BadRequestException("Товар " + (index + 1) + " указан неверно");
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const description = typeof record.description === "string" ? record.description.trim() : "";
      const price = record.price;
      if (!name || name.length > 80 || description.length > 240 || !Number.isInteger(price) || (price as number) < 1 || (price as number) > 2147483647)
        throw new BadRequestException("Проверьте название, описание и цену товара " + (index + 1));
      return { name, description, price: price as number };
    });
  }

  async bulkCreateProducts(actor: AuthenticatedUser, categoryId: string, rawProducts: unknown, files: ImageFile[]) {
    this.requireAdmin(actor);
    await this.getCategory(categoryId);
    const products = this.parseBatchProducts(rawProducts, files.length);
    const keys: string[] = [];
    try {
      for (const file of files) keys.push(await this.saveProductImage(file));
      const created = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.giftCatalog.aggregate({ where: { categoryId, deletedAt: null }, _max: { position: true } });
        const start = (latest._max.position ?? -10) + 10;
        const rows = await Promise.all(products.map((product, index) => tx.giftCatalog.create({ data: { id: randomUUID(), categoryId, name: product.name, description: product.description, price: product.price, emoji: "🎁", kind: "gift", active: true, position: start + index * 10, imageKey: keys[index] } })));
        await tx.moderationAudit.create({ data: { actorId: actor.id, action: "STORE_PRODUCT_BULK_CREATE", details: { categoryId, productIds: rows.map((row) => row.id), count: rows.length } } });
        return rows;
      });
      return created.map((product) => this.productView(product));
    } catch (error) {
      await Promise.all(keys.map((key) => this.removeProductImage(key)));
      throw error;
    }
  }
}

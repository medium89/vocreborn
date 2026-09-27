import { Body, Controller, Delete, Get, Param, Post, Put, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { StoreCategoryDto, StoreProductDto } from "./store-editor.dto";
import { StoreEditorService } from "./store-editor.service";

@Controller("admin/store")
@UseGuards(SessionGuard)
export class StoreEditorController {
  constructor(private readonly store: StoreEditorService) {}

  @Get()
  catalog(@CurrentUser() actor: AuthenticatedUser) { return this.store.catalog(actor); }

  @Post("categories")
  createCategory(@Body() input: StoreCategoryDto, @CurrentUser() actor: AuthenticatedUser) { return this.store.createCategory(actor, input); }

  @Put("categories/:id")
  updateCategory(@Param("id") id: string, @Body() input: StoreCategoryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.store.updateCategory(actor, id, input);
  }

  @Delete("categories/:id")
  deleteCategory(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) { return this.store.deleteCategory(actor, id); }

  @Post("categories/:id/image")
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: "session" })
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadCategoryImage(
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) { return this.store.uploadCategoryImage(actor, id, file); }

  @Delete("categories/:id/image")
  deleteCategoryImage(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) { return this.store.deleteCategoryImage(actor, id); }

  @Post("products")
  createProduct(@Body() input: StoreProductDto, @CurrentUser() actor: AuthenticatedUser) { return this.store.createProduct(actor, input); }

  @Put("products/:id")
  updateProduct(@Param("id") id: string, @Body() input: StoreProductDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.store.updateProduct(actor, id, input);
  }

  @Delete("products/:id")
  deleteProduct(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) { return this.store.deleteProduct(actor, id); }
}

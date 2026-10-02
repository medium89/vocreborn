import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { RateLimit } from "../security/rate-limit.decorator";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, type AuthenticatedRequest } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { EmailAddressDto, EmailPasswordResetDto, EmailTokenDto, SetEmailDto } from "./dto/email.dto";
import { ChangePasswordDto, CreateRecoveryCodeDto, ResetPasswordDto } from "./dto/password.dto";
import { RegisterDto } from "./dto/register.dto";
import { GuestLoginDto } from "./dto/guest.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileService } from "./profile.service";
import { SessionGuard } from "./session.guard";

function setSessionCookie(response: Response, token: string, expiresAt: Date) {
  response.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/" });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "ip" })
  async register(@Body() input: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.register(input);
    setSessionCookie(response, session.token, session.expiresAt);
    return { user: session.user };
  }

  @Post("guest")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "ip" })
  async guest(@Body() input: GuestLoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.registerGuest(input.turnstileToken);
    setSessionCookie(response, session.token, session.expiresAt);
    return { user: session.user };
  }

  @Post("guest/upgrade")
  @UseGuards(SessionGuard)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" })
  async upgradeGuest(@Body() input: RegisterDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.upgradeGuest(request.user.id, input);
    setSessionCookie(response, session.token, session.expiresAt);
    return { user: session.user };
  }

  @Post("login")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 15 * 60 * 1000, key: "ip-and-username" })
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(input);
    setSessionCookie(response, session.token, session.expiresAt);
    return { user: session.user };
  }

  @Post("email/verify")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "ip" })
  verifyEmail(@Body() input: EmailTokenDto) {
    return this.auth.verifyEmail(input);
  }

  @Post("password/email/request")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "ip" })
  requestEmailReset(@Body() input: EmailAddressDto) {
    return this.auth.requestEmailReset(input);
  }

  @Post("password/email/reset")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "ip" })
  resetPasswordByEmail(@Body() input: EmailPasswordResetDto) {
    return this.auth.resetPasswordByEmail(input);
  }

  @Post("password/reset")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "ip" })
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.auth.resetPassword(input);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE] as string | undefined);
    response.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  getMe(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  @Patch()
  @RateLimit({ limit: 30, windowMs: 60 * 1000, key: "session" })
  async update(@Body() input: UpdateProfileDto, @Req() request: AuthenticatedRequest) {
    const profile = await this.profiles.update(request.user.id, input);
    return { user: { ...request.user, ...profile } };
  }

  @Post("recovery-code")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" })
  createRecoveryCode(@Body() input: CreateRecoveryCodeDto, @Req() request: AuthenticatedRequest) {
    return this.auth.createRecoveryCode(request.user.id, input);
  }

  @Post("email")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" })
  setEmail(@Body() input: SetEmailDto, @Req() request: AuthenticatedRequest) {
    return this.auth.setEmail(request.user.id, input);
  }

  @Post("email/resend")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" })
  resendVerification(@Req() request: AuthenticatedRequest) {
    return this.auth.resendVerification(request.user.id);
  }

  @Post("password")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "session" })
  async changePassword(
    @Body() input: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.changePassword(request.user.id, input);
    setSessionCookie(response, session.token, session.expiresAt);
    return { user: session.user };
  }

  @Get("albums")
  async listAlbums(@Req() request: AuthenticatedRequest) { return { albums: await this.profiles.listAlbums(request.user.id) }; }

  @Post("albums")
  @RateLimit({ limit: 6, windowMs: 60 * 60 * 1000, key: "session" })
  async createAlbum(@Body("title") title: string, @Req() request: AuthenticatedRequest) {
    return { album: await this.profiles.createAlbum(request.user.id, title ?? "") };
  }

  @Post("albums/photos/:photoId/like")  @RateLimit({ limit: 60, windowMs: 60 * 1000, key: "session" })  async likePhoto(@Param("photoId", new ParseUUIDPipe({ version: "4" })) photoId: string, @Req() request: AuthenticatedRequest) { return this.profiles.togglePhotoLike(request.user.id, photoId); }  @Post("albums/photos/:photoId/comments")  @RateLimit({ limit: 30, windowMs: 60 * 1000, key: "session" })  async commentPhoto(@Param("photoId", new ParseUUIDPipe({ version: "4" })) photoId: string, @Body("body") body: string, @Req() request: AuthenticatedRequest) { return this.profiles.commentPhoto(request.user.id, photoId, body ?? ""); }  @Delete("albums/:albumId")
  async deleteAlbum(@Param("albumId", new ParseUUIDPipe({ version: "4" })) albumId: string, @Req() request: AuthenticatedRequest) {
    await this.profiles.deleteAlbum(request.user.id, albumId); return undefined;
  }

  @Post("albums/:albumId/photos")
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: "session" })
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadAlbumPhoto(@Param("albumId", new ParseUUIDPipe({ version: "4" })) albumId: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number; originalname: string } | undefined, @Req() request: AuthenticatedRequest) {
    return { photo: await this.profiles.uploadAlbumPhoto(request.user.id, albumId, file) };
  }

  @Delete("albums/:albumId/photos/:photoId")
  async deleteAlbumPhoto(@Param("albumId", new ParseUUIDPipe({ version: "4" })) albumId: string, @Param("photoId", new ParseUUIDPipe({ version: "4" })) photoId: string, @Req() request: AuthenticatedRequest) {
    await this.profiles.deleteAlbumPhoto(request.user.id, albumId, photoId); return undefined;
  }
  @Post("avatar")
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, key: "session" })
  @UseInterceptors(FileInterceptor("avatar", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadAvatar(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const profile = await this.profiles.saveAvatar(request.user.id, file);
    return { user: { ...request.user, ...profile } };
  }
}

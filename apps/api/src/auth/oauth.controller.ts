import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import { CurrentUser } from "./current-user.decorator";
import { SESSION_COOKIE, type AuthenticatedUser } from "./auth.types";
import { OAuthService } from "./oauth.service";
import { RateLimit } from "../security/rate-limit.decorator";
import { SessionGuard } from "./session.guard";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/auth/oauth", maxAge: 10 * 60 * 1000 };
class CompleteOAuthDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(2, 64)
  displayName!: string;

  @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @Matches(/^[a-z0-9_]{3,32}$/, { message: "Тег: 3–32 символа, латиница, цифры и подчёркивание" })
  username!: string;
}
class SaveProviderDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Length(1, 255)
  clientId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  clientSecret?: string;
}

@Controller("auth/oauth")
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get("providers")
  providers() { return this.oauth.publicProviders(); }

  @Get("linked")
  @UseGuards(SessionGuard)
  linked(@CurrentUser() actor: AuthenticatedUser) { return this.oauth.linked(actor); }

  @Get("pending")
  pending(@Req() request: Request) { return this.oauth.pending(request.cookies?.oauth_setup); }

  @Post("complete")
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: "ip" })
  async complete(@Req() request: Request, @Body() input: CompleteOAuthDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.oauth.complete(request.cookies?.oauth_setup, input);
    response.clearCookie("oauth_setup", { path: cookieOptions.path });
    response.cookie(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: cookieOptions.secure, expires: session.expiresAt, path: "/" });
    return { user: session.user };
  }

  @Get(":provider/start")
  @RateLimit({ limit: 15, windowMs: 60 * 60 * 1000, key: "ip" })
  async start(@Param("provider") provider: string, @Query("link") link: string | undefined, @Req() request: Request, @Res() response: Response) {
    const flow = await this.oauth.start(provider, request.cookies?.[SESSION_COOKIE], link === "1");
    response.cookie("oauth_state", flow.state, cookieOptions);
    response.redirect(302, flow.url);
  }

  @Get(":provider/callback")
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: "ip" })
  async callback(@Param("provider") provider: string, @Query() query: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    response.clearCookie("oauth_state", { path: cookieOptions.path });
    try {
      const result = await this.oauth.callback(provider, query, request.cookies?.oauth_state, request.cookies?.[SESSION_COOKIE]);
      if ("session" in result && result.session) {
        response.cookie(SESSION_COOKIE, result.session.token, { httpOnly: true, sameSite: "lax", secure: cookieOptions.secure, expires: result.session.expiresAt, path: "/" });
        response.redirect(302, this.oauth.webUrl({ auth: "social_success" }));
      } else if ("linked" in result && result.linked) {
        response.redirect(302, this.oauth.webUrl({ auth: "social_linked" }));
      } else if ("pending" in result && result.pending) {
        response.cookie("oauth_setup", result.pending, cookieOptions);
        response.redirect(302, this.oauth.webUrl({ auth: "social_setup" }));
      }
    } catch (error) {
      const message = error instanceof HttpException ? error.message : "Не удалось войти через провайдера";
      response.redirect(302, this.oauth.webUrl({ auth: "social_error", reason: message.slice(0, 180) }));
    }
  }
}

@Controller("admin/auth-providers")
@UseGuards(SessionGuard)
export class OAuthAdminController {
  constructor(private readonly oauth: OAuthService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) { return this.oauth.adminProviders(actor); }

  @Patch(":provider")
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: "session" })
  save(@CurrentUser() actor: AuthenticatedUser, @Param("provider") provider: string, @Body() input: SaveProviderDto) {
    return this.oauth.saveProvider(actor, provider, input);
  }
}

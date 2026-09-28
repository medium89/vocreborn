import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsObject, IsOptional } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { RateLimit } from "../security/rate-limit.decorator";
import { QuizService } from "./quiz.service";
class DocumentDto { @IsObject() document!: Record<string,unknown>; }
class ImportDto extends DocumentDto { @IsIn(["create","update"]) mode!: "create"|"update"; }
class ThemeDto { @IsBoolean() enabled!: boolean; }
class SettingsDto { @IsObject() settings!: Record<string,unknown>; }
class CommandDto { @IsIn(["start","pause","resume","skip","finish"]) action!: string; @IsOptional() @IsBoolean() confirmed?: boolean; }
@Controller("quiz")
@UseGuards(SessionGuard)
export class QuizController {
  constructor(private readonly quiz:QuizService){}
  @Get("status") status(){return this.quiz.publicStatus();}
}
@Controller("admin/quiz")
@UseGuards(SessionGuard)
export class QuizAdminController {
  constructor(private readonly quiz:QuizService){}
  @Get() overview(@CurrentUser() actor:AuthenticatedUser,@Query("cursor",new ParseUUIDPipe({version:"4",optional:true})) cursor?:string){return this.quiz.overview(actor,cursor);}
  @Post("preview") @RateLimit({limit:30,windowMs:60000,key:"session"}) preview(@CurrentUser() actor:AuthenticatedUser,@Body() input:DocumentDto){return this.quiz.preview(actor,input.document);}
  @Post("import") @RateLimit({limit:10,windowMs:60000,key:"session"}) import(@CurrentUser() actor:AuthenticatedUser,@Body() input:ImportDto){return this.quiz.import(actor,input.document,input.mode);}
  @Get("themes/:id") export(@CurrentUser() actor:AuthenticatedUser,@Param("id",new ParseUUIDPipe({version:"4"})) id:string){return this.quiz.export(actor,id);}
  @Patch("themes/:id") theme(@CurrentUser() actor:AuthenticatedUser,@Param("id",new ParseUUIDPipe({version:"4"})) id:string,@Body() input:ThemeDto){return this.quiz.theme(actor,id,input.enabled);}
  @Delete("themes/:id") remove(@CurrentUser() actor:AuthenticatedUser,@Param("id",new ParseUUIDPipe({version:"4"})) id:string){return this.quiz.theme(actor,id,undefined,true);}
  @Patch("settings") settings(@CurrentUser() actor:AuthenticatedUser,@Body() input:SettingsDto){return this.quiz.settings(actor,input.settings);}
  @Post("control") @RateLimit({limit:30,windowMs:60000,key:"session"}) control(@CurrentUser() actor:AuthenticatedUser,@Body() input:CommandDto){return this.quiz.command(actor,input.action,input.confirmed);}
}

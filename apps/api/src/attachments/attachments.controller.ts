import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { IsIn } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../security/rate-limit.decorator";
import { AttachmentsService } from "./attachments.service";

class ReviewAttachmentDto { @IsIn(["APPROVED", "REJECTED"]) status!: "APPROVED" | "REJECTED"; }

@Controller("attachments")
@UseGuards(SessionGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}
  @Post() @RateLimit({ limit: 12, windowMs: 60 * 60 * 1000, key: "session" }) @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  upload(@UploadedFile() file: { buffer: Buffer; mimetype: string; size: number; originalname: string } | undefined, @CurrentUser() user: AuthenticatedUser) { return this.attachments.upload(user.id, file); }
  @Get("pending") listPending(@CurrentUser() user: AuthenticatedUser) { return this.attachments.listPending(user); }
  @Patch(":id/review") review(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: ReviewAttachmentDto, @CurrentUser() user: AuthenticatedUser) { return this.attachments.review(user, id, input.status); }
  @Get(":id/content") content(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Req() request: AuthenticatedRequest, @Res() response: Response) { return this.sendContent(id, false, request, response); }
  @Get(":id/preview") preview(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Req() request: AuthenticatedRequest, @Res() response: Response) { return this.sendContent(id, true, request, response); }
  private async sendContent(id: string, preview: boolean, request: AuthenticatedRequest, response: Response) {
    const result = await this.attachments.readContent(request.user, id, preview);
    response.setHeader("Content-Type", result.mimeType);
    response.setHeader("Content-Disposition", 'inline; filename="' + encodeURIComponent(preview ? "preview.webp" : result.attachment.originalName) + '"');
    response.setHeader("Cache-Control", "private, max-age=3600");
    if (!preview && result.attachment.kind === "AUDIO") {
      response.setHeader("Accept-Ranges", "bytes");
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const size = result.buffer.length;
        const first = match?.[1] ?? "";
        const last = match?.[2] ?? "";
        const suffix = first === "" ? Number(last) : 0;
        const start = first === "" ? Math.max(0, size - suffix) : Number(first);
        const end = first === "" || last === "" ? size - 1 : Math.min(Number(last), size - 1);
        if (!match || (!first && !last) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (first === "" && (!Number.isSafeInteger(suffix) || suffix <= 0)) || start >= size || end < start) {
          response.setHeader("Content-Range", 'bytes */' + size);
          response.status(416).end();
          return;
        }
        const chunk = result.buffer.subarray(start, end + 1);
        response.setHeader("Content-Range", 'bytes ' + start + '-' + end + '/' + size);
        response.setHeader("Content-Length", chunk.length);
        response.status(206).send(chunk);
        return;
      }
    }
    response.setHeader("Content-Length", result.buffer.length);
    response.send(result.buffer);
  }
}

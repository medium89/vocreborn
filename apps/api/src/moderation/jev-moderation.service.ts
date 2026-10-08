import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { UserStatus } from "@prisma/client";
import { ChatService } from "../chat/chat.service";
import { PrismaService } from "../database/prisma.service";

const BOT_USERNAME = "tusova_overseer";
const BOT_DISPLAY_NAME = "Сова Надзиратель";
const DEFAULT_THRESHOLD = 0.72;

const CHECKS = [
  {
    key: "profanity",
    label: "мат",
    instructions: "Содержит ли сообщение мат, нецензурную или обсценную лексику, включая намеренно искажённое написание?",
    true: "В сообщении есть мат, нецензурная или обсценная лексика.",
    false: "В сообщении нет мата или нецензурной лексики.",
  },
  {
    key: "advertising",
    label: "реклама",
    instructions: "Является ли сообщение рекламой или навязчивым продвижением товара, услуги, сайта, канала, чата или другого ресурса?",
    true: "Сообщение рекламирует или продвигает товар, услугу, сайт, канал, чат или другой ресурс.",
    false: "Сообщение является обычным разговором, личной рекомендацией без продвижения или не содержит рекламы.",
  },
  {
    key: "insult",
    label: "оскорбление",
    instructions: "Содержит ли сообщение прямое оскорбление, унижение или персональную грубую атаку на человека или группу людей?",
    true: "Есть прямое оскорбление, унижение или направленная грубая атака.",
    false: "Нет направленного оскорбления или унижения.",
  },
  {
    key: "toxicity",
    label: "токсичность",
    instructions: "Является ли тон сообщения токсичным, враждебным, агрессивным, травящим или намеренно провоцирующим конфликт?",
    true: "Тон сообщения токсичный, агрессивный, враждебный, травящий или явно конфликтный.",
    false: "Сообщение нейтральное, дружелюбное либо содержит обычное несогласие без токсичности.",
  },
  {
    key: "spam",
    label: "спам",
    instructions: "Является ли сообщение спамом: флудом, бессмысленным повтором, массовой рассылкой, скамом или навязчивым повторяющимся продвижением?",
    true: "Сообщение похоже на спам, флуд, скам, массовую рассылку или бессмысленный повтор.",
    false: "Это обычное осмысленное сообщение, не являющееся спамом.",
  },
] as const;

type NoulAnswer = { type: "noul"; noul: number };
type JevResponse = { answers?: Record<string, NoulAnswer | { type: string }> };

@Injectable()
export class JevModerationService implements OnModuleInit {
  private readonly logger = new Logger(JevModerationService.name);
  private bot?: { id: string; displayName: string };
  private readonly apiKey = process.env.JEV_API_KEY?.trim();
  private readonly threshold = this.readThreshold();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === "test" || !this.apiKey) {
      if (process.env.NODE_ENV !== "test") this.logger.log("Jev moderation disabled: JEV_API_KEY is not configured");
      return;
    }

    const room = await this.prisma.room.findUnique({ where: { id: "main" }, select: { id: true } });
    if (!room) {
      this.logger.warn("Jev moderation disabled: main room not found");
      return;
    }

    const occupied = await this.prisma.user.findUnique({ where: { username: BOT_USERNAME }, select: { id: true, isBot: true } });
    if (occupied && !occupied.isBot) {
      this.logger.error("Jev moderation disabled: service username is occupied by a regular account");
      return;
    }

    const bot = await this.prisma.user.upsert({
      where: { username: BOT_USERNAME },
      create: {
        username: BOT_USERNAME,
        displayName: BOT_DISPLAY_NAME,
        gender: "UNSPECIFIED",
        isBot: true,
        role: "USER",
        participantBadge: "sheriff",
        status: UserStatus.ONLINE,
        avatarKey: "/bot-avatars/quiz.svg",
        avatarThumbKey: "/bot-avatars/quiz.svg",
      },
      update: {
        isBot: true,
        role: "USER",
        isDj: false,
        passwordHash: null,
        isGuest: false,
        deletedAt: null,
      },
      select: { id: true, displayName: true },
    });

    await this.prisma.roomMembership.upsert({
      where: { userId_roomId: { userId: bot.id, roomId: room.id } },
      update: {},
      create: { userId: bot.id, roomId: room.id },
    });

    this.bot = bot;
    this.chat.subscribeMessages((event) => {
      if (!event.roomId || event.message.system || event.message.adminVoice || event.authorId === bot.id) return;
      void this.review(event.roomId, event.authorId, event.message.body).catch((error: unknown) => {
        this.logger.warn("Jev moderation check failed: " + (error instanceof Error ? error.message : String(error)));
      });
    });

    this.logger.log("Jev moderation enabled with threshold " + this.threshold.toFixed(2));
  }

  private async review(roomId: string, authorId: string, body: string) {
    const text = body.trim();
    if (!text || !this.bot || !this.apiKey) return;

    const author = await this.prisma.user.findFirst({
      where: { id: authorId, deletedAt: null },
      select: { displayName: true, isBot: true },
    });
    if (!author || author.isBot) return;

    const questions = Object.fromEntries(CHECKS.map((check) => [
      check.key,
      {
        type: "noul",
        instructions: check.instructions,
        criteria: { true: check.true, false: check.false },
      },
    ]));

    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.JEV_MODEL?.trim() || "jev-latest",
        state: { message: text },
        questions,
      }),
      signal: AbortSignal.timeout(4_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240).replace(/\s+/g, " ");
      throw new Error("HTTP " + response.status + (detail ? ": " + detail : ""));
    }

    const payload = await response.json() as JevResponse;
    const detected = CHECKS
      .filter((check) => {
        const answer = payload.answers?.[check.key];
        return answer?.type === "noul" && typeof (answer as NoulAnswer).noul === "number" && (answer as NoulAnswer).noul >= this.threshold;
      })
      .map((check) => check.label);

    if (detected.length === 0) return;

    const notice = "В сообщении от «" + author.displayName + "» замечено: " + detected.join(", ") + ".";
    await this.chat.createBotMessage(roomId, this.bot.id, this.bot.displayName, notice, true);
  }

  private readThreshold() {
    const value = Number(process.env.JEV_MODERATION_THRESHOLD ?? DEFAULT_THRESHOLD);
    if (!Number.isFinite(value)) return DEFAULT_THRESHOLD;
    return Math.min(0.99, Math.max(0.5, value));
  }
}

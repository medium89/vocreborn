import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Gender, UserStatus } from "@prisma/client";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import { PrismaService } from "../database/prisma.service";

const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 90_000;
const BOTS = [
  { username: "aura_bot_maks", displayName: "Макс · бот", gender: Gender.MALE },
  { username: "aura_bot_ilya", displayName: "Илья · бот", gender: Gender.MALE },
  { username: "aura_bot_oleg", displayName: "Олег · бот", gender: Gender.MALE },
  { username: "aura_bot_anya", displayName: "Аня · бот", gender: Gender.FEMALE },
  { username: "aura_bot_irina", displayName: "Ирина · бот", gender: Gender.FEMALE },
  { username: "aura_bot_lera", displayName: "Лера · бот", gender: Gender.FEMALE },
  { username: "aura_bot_sasha", displayName: "Саша · бот", gender: Gender.UNSPECIFIED },
  { username: "aura_bot_rene", displayName: "Рене · бот", gender: Gender.UNSPECIFIED },
  { username: "aura_bot_nika", displayName: "Ника · бот", gender: Gender.UNSPECIFIED },
] as const;
const REPLIES = [
  "Хорошая мысль, {name}. Я бы сегодня выбрал(а) что-то спокойное: музыка, чай и немного разговоров.",
  "Поддерживаю, {name}. А что у вас обычно помогает переключиться после длинного дня?",
  "У меня сегодня настроение на маленькие планы. Иногда они работают лучше больших списков.",
  "Кстати, приятно, когда в комнате не надо торопиться с ответом. Можно просто быть рядом.",
  "Согласен(на), {name}. Давайте оставим здесь что-нибудь хорошее: трек, мысль или рекомендацию.",
  "Интересно. Я бы начал(а) с самого простого варианта и посмотрел(а), куда разговор приведёт.",
] as const;
const DIRECT_RECIPIENT_USERNAME = process.env.AURA_BOT_DIRECT_USERNAME ?? "medium";
const DIRECT_REPLIES = [
  "Привет, {name}! Как проходит ваш день?",
  "{name}, есть минутка на разговор? Что сейчас у вас на уме?",
  "Я заглянул(а) узнать, как вы. Всё в порядке?",
  "{name}, желаю вам спокойного и хорошего вечера.",
] as const;

@Injectable()
export class BotsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotsService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private directTimer?: ReturnType<typeof setTimeout>;
  private bots: Array<{ id: string; displayName: string }> = [];
  private previous?: { id: string; displayName: string };

  constructor(private readonly prisma: PrismaService, private readonly chat: ChatService, private readonly gateway: ChatGateway) {}

  async onModuleInit() {
    if (process.env.AURA_BOTS_ENABLED === "false") return;
    const room = await this.prisma.room.findUnique({ where: { id: "main" }, select: { id: true } });
    if (!room) { this.logger.warn("Главная комната не найдена: боты не запущены"); return; }
    this.bots = await Promise.all(BOTS.map(async (bot) => {
      const user = await this.prisma.user.upsert({
        where: { username: bot.username },
        update: { displayName: bot.displayName, gender: bot.gender, isBot: true, status: UserStatus.ONLINE, deletedAt: null },
        create: { username: bot.username, displayName: bot.displayName, gender: bot.gender, isBot: true, status: UserStatus.ONLINE },
      });
      await this.prisma.roomMembership.upsert({ where: { userId_roomId: { userId: user.id, roomId: room.id } }, update: {}, create: { userId: user.id, roomId: room.id } });
      return { id: user.id, displayName: user.displayName };
    }));
    this.schedule();
    this.scheduleDirectMessages();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.directTimer) clearTimeout(this.directTimer);
  }

  private scheduleDirectMessages() {
    this.directTimer = setTimeout(() => void this.publishDirectMessage().finally(() => this.scheduleDirectMessages()), 60_000);
  }

  private async publishDirectMessage() {
    const recipient = await this.prisma.user.findFirst({
      where: { username: DIRECT_RECIPIENT_USERNAME, isBot: false, deletedAt: null },
      select: { id: true, displayName: true },
    });
    if (!recipient) return;
    const author = this.bots[Math.floor(Math.random() * this.bots.length)];
    if (!author) return;
    const template = DIRECT_REPLIES[Math.floor(Math.random() * DIRECT_REPLIES.length)];
    const body = template.replace("{name}", recipient.displayName);
    const message = await this.chat.createDirectMessage(recipient.id, body, "bot-direct-" + randomUUID(), author.id, author.displayName);
    this.gateway.emitDirectMessage(recipient.id, author.id, message);
  }

  private schedule() {
    const delay = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
    this.timer = setTimeout(() => void this.publish().finally(() => this.schedule()), delay);
  }

  private async publish() {
    const candidates = this.bots.filter((bot) => bot.id !== this.previous?.id);
    const author = candidates[Math.floor(Math.random() * candidates.length)];
    if (!author) return;
    const template = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    const body = template.replace("{name}", this.previous?.displayName.replace(" · бот", "") ?? "друзья");
    const message = await this.chat.createBotMessage("main", author.id, author.displayName, body);
    this.previous = author;
    this.gateway.emitRoomMessage("main", message);
  }
}

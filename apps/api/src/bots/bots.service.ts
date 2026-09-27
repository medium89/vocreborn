import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Gender, UserStatus } from "@prisma/client";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import { PrismaService } from "../database/prisma.service";
import { MESSAGE_COLOR_PALETTE } from "../gifts/cosmetics";

const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 90_000;
const BOTS = [
  { username: "tusova_bot_maks", displayName: "Северный Лис", gender: Gender.MALE, avatar: "male-1" },
  { username: "tusova_bot_ilya", displayName: "Тихий Шторм", gender: Gender.MALE, avatar: "male-2" },
  { username: "tusova_bot_oleg", displayName: "Неоновый Пилигрим", gender: Gender.MALE, avatar: "male-3" },
  { username: "tusova_bot_anya", displayName: "Искра Полуночи", gender: Gender.FEMALE, avatar: "female-1" },
  { username: "tusova_bot_irina", displayName: "Лунная Архивистка", gender: Gender.FEMALE, avatar: "female-2" },
  { username: "tusova_bot_lera", displayName: "Зелёная Комета", gender: Gender.FEMALE, avatar: "female-3" },
  { username: "tusova_bot_sasha", displayName: "Эхо Тайги", gender: Gender.UNSPECIFIED, avatar: "female-4" },
  { username: "tusova_bot_rene", displayName: "Смотритель Снов", gender: Gender.UNSPECIFIED, avatar: "male-4" },
  { username: "tusova_bot_nika", displayName: "Пыльца Звёзд", gender: Gender.UNSPECIFIED, avatar: "female-5" },
  { username: "tusova_bot_cedar", displayName: "Кедровый Барон", gender: Gender.MALE, avatar: "male-5" },
  { username: "tusova_bot_raven", displayName: "Медный Ворон", gender: Gender.MALE, avatar: "male-1" },
  { username: "tusova_bot_polaris", displayName: "Капитан Полярис", gender: Gender.MALE, avatar: "male-2" },
  { username: "tusova_bot_cartographer", displayName: "Туманный Картограф", gender: Gender.MALE, avatar: "male-3" },
  { username: "tusova_bot_radiofox", displayName: "Лисий Радиоэфир", gender: Gender.MALE, avatar: "male-4" },
  { username: "tusova_bot_watchman", displayName: "Полуночный Смотритель", gender: Gender.MALE, avatar: "male-5" },
  { username: "tusova_bot_amber", displayName: "Янтарный Скиталец", gender: Gender.MALE, avatar: "male-1" },
  { username: "tusova_bot_astra", displayName: "Астра Ледяная", gender: Gender.FEMALE, avatar: "female-4" },
  { username: "tusova_bot_attic", displayName: "Фея Чердака", gender: Gender.FEMALE, avatar: "female-5" },
  { username: "tusova_bot_mint", displayName: "Мята и Молнии", gender: Gender.FEMALE, avatar: "female-1" },
  { username: "tusova_bot_madame", displayName: "Мадам Переполох", gender: Gender.FEMALE, avatar: "female-2" },
  { username: "tusova_bot_storm", displayName: "Гроза Переулков", gender: Gender.FEMALE, avatar: "female-3" },
  { username: "tusova_bot_silk", displayName: "Шёлковая Буря", gender: Gender.FEMALE, avatar: "female-4" },
  { username: "tusova_bot_owl", displayName: "Сова на Проводе", gender: Gender.FEMALE, avatar: "female-5" },
  { username: "tusova_bot_signal", displayName: "Сигнал из Тайги", gender: Gender.UNSPECIFIED, avatar: "male-2" },
  { username: "tusova_bot_teapot", displayName: "Космический Чайник", gender: Gender.UNSPECIFIED, avatar: "male-3" },
  { username: "tusova_bot_snowradio", displayName: "Радио Снежок", gender: Gender.UNSPECIFIED, avatar: "female-1" },
  { username: "tusova_bot_pixel", displayName: "Пиксельный Призрак", gender: Gender.UNSPECIFIED, avatar: "male-4" },
  { username: "tusova_bot_beacon", displayName: "Ночной Маяк", gender: Gender.UNSPECIFIED, avatar: "female-2" },
  { username: "tusova_bot_noise", displayName: "Тёплый Шум", gender: Gender.UNSPECIFIED, avatar: "female-3" },
] as const;
const REPLIES = [
  "Хорошая мысль, {name}. Я бы сегодня выбрал(а) что-то спокойное: музыка, чай и немного разговоров.",
  "Поддерживаю, {name}. А что у вас обычно помогает переключиться после длинного дня?",
  "У меня сегодня настроение на маленькие планы. Иногда они работают лучше больших списков.",
  "Кстати, приятно, когда в комнате не надо торопиться с ответом. Можно просто быть рядом.",
  "Согласен(на), {name}. Давайте оставим здесь что-нибудь хорошее: трек, мысль или рекомендацию.",
  "Интересно. Я бы начал(а) с самого простого варианта и посмотрел(а), куда разговор приведёт.",
] as const;
const DIRECT_RECIPIENT_USERNAME = process.env.TUSOVA_BOT_DIRECT_USERNAME ?? "medium";
const PUBLIC_MENTION_USERNAME = process.env.TUSOVA_BOT_MENTION_USERNAME ?? DIRECT_RECIPIENT_USERNAME;
const MENTION_REPLIES = [
  "@{username}, как у тебя сегодня дела? Что интересного происходит?",
  "@{username}, какой трек сейчас посоветуешь всем в чате?",
  "@{username}, загляни в обсуждение: интересно узнать твоё мнение.",
  "@{username}, есть идея для хорошего вечера? Поделись с нами.",
  "@{username}, ты как? Давно не слышали твоих новостей.",
] as const;
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
    if (process.env.NODE_ENV === "test") return;
    if (process.env.NODE_ENV === "production" || process.env.TUSOVA_BOTS_ENABLED !== "true") {
      await this.prisma.user.updateMany({ where: { isBot: true, status: UserStatus.ONLINE }, data: { status: UserStatus.OFFLINE } });
      return;
    }
    const room = await this.prisma.room.findUnique({ where: { id: "main" }, select: { id: true } });
    if (!room) { this.logger.warn("Главная комната не найдена: боты не запущены"); return; }
    const community = await this.prisma.community.findFirst({ where: { name: "Сибирь" }, select: { id: true } });
    this.bots = await Promise.all(BOTS.map(async (bot, index) => {
      const avatarKey = "/bot-avatars/" + bot.avatar + ".webp";
      const avatarThumbKey = "/bot-avatars/" + bot.avatar + "-preview.webp";
      const current = await this.prisma.user.findUnique({ where: { username: bot.username }, select: { id: true } });
      if (!current) {
        const legacyUsername = bot.username.replace("tusova_bot_", "aura_bot_");
        const legacy = await this.prisma.user.findUnique({ where: { username: legacyUsername }, select: { id: true, isBot: true } });
        if (legacy?.isBot) await this.prisma.user.update({ where: { id: legacy.id }, data: { username: bot.username } });
      }
      const user = await this.prisma.user.upsert({
        where: { username: bot.username },
        update: { displayName: bot.displayName, gender: bot.gender, isBot: true, status: UserStatus.ONLINE, deletedAt: null },
        create: { username: bot.username, displayName: bot.displayName, gender: bot.gender, isBot: true, status: UserStatus.ONLINE, avatarKey, avatarThumbKey },
      });
      if (!user.avatarKey || !user.avatarThumbKey) await this.prisma.user.update({ where: { id: user.id }, data: { avatarKey, avatarThumbKey } });
      await this.prisma.roomMembership.upsert({ where: { userId_roomId: { userId: user.id, roomId: room.id } }, update: {}, create: { userId: user.id, roomId: room.id } });
      if (community) await this.prisma.communityMembership.upsert({
        where: { communityId_userId: { communityId: community.id, userId: user.id } },
        update: { role: "MEMBER", status: "APPROVED" },
        create: { communityId: community.id, userId: user.id, role: "MEMBER", status: "APPROVED" },
      });
      const color = MESSAGE_COLOR_PALETTE[index * 3];
      const effects: Array<{ effectKey: string; settings: Record<string, string | boolean> }> = [
        { effectKey: "messageColor", settings: { enabled: true, color } },
      ];
      if (index % 3 !== 2) effects.push({ effectKey: "boldText", settings: { enabled: true } });
      if (index % 4 === 0 || index % 4 === 3) effects.push({ effectKey: "gradientText", settings: { enabled: true, start: color, end: MESSAGE_COLOR_PALETTE[(index * 3 + 17) % MESSAGE_COLOR_PALETTE.length] } });
      if (index % 5 === 1 || index % 5 === 4) effects.push({ effectKey: "gradientNick", settings: { enabled: true, start: color, end: MESSAGE_COLOR_PALETTE[(index * 3 + 11) % MESSAGE_COLOR_PALETTE.length] } });
      await Promise.all(effects.map(({ effectKey, settings }) => this.prisma.userCosmetic.upsert({
        where: { userId_effectKey: { userId: user.id, effectKey } },
        update: { settings },
        create: { userId: user.id, effectKey, settings },
      })));
      await this.prisma.message.updateMany({ where: { authorId: user.id, authorName: { not: bot.displayName } }, data: { authorName: bot.displayName } });
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
    this.timer = setTimeout(() => void this.publish().catch((error) => this.logger.error("Не удалось отправить сообщение бота", error)).finally(() => this.schedule()), delay);
  }

  private async publish() {
    const candidates = this.bots.filter((bot) => bot.id !== this.previous?.id);
    const author = candidates[Math.floor(Math.random() * candidates.length)];
    if (!author) return;
    let body = "";
    if (Math.random() < 0.3) {
      const recipient = await this.prisma.user.findFirst({
        where: { username: PUBLIC_MENTION_USERNAME, isBot: false, deletedAt: null },
        select: { username: true },
      });
      const template = recipient && MENTION_REPLIES[Math.floor(Math.random() * MENTION_REPLIES.length)];
      if (template) body = template.replace("{username}", recipient.username);
    }
    if (!body) {
      const template = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      body = template.replace("{name}", this.previous?.displayName ?? "друзья");
    }
    const message = await this.chat.createBotMessage("main", author.id, author.displayName, body);
    this.previous = author;
    this.gateway.emitRoomMessage("main", message);
  }
}

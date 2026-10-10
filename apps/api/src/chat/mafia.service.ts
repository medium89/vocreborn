import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MafiaNightActionType, MafiaPhase, MafiaRole, Prisma, type MafiaTestMessage } from "@prisma/client";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ChatSettingsService } from "../settings/chat-settings.service";
import { ChatService } from "./chat.service";
import { mafiaNightVictim, mafiaRoleDeck, mafiaVoteTarget, mafiaWinner } from "./mafia.rules";
import { buildMafiaAiView, requestMafiaAiDecision, type MafiaAiDecision } from "./mafia.ai";

type FullGame = Prisma.MafiaGameGetPayload<{ include: { players: true; votes: true } }>;
type Outbound = { roomId: string; event: string; payload: unknown; userId?: string };
type Listener = (event: Outbound) => void;
type Transition = { roomId: string; event: string; payload?: Record<string, unknown>; notice?: string; eliminated?: { userId: string; name: string; role: MafiaRole } };

@Injectable()
export class MafiaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MafiaService.name);
  private readonly listeners = new Set<Listener>();
  private readonly processingTestGames = new Set<string>();
  private readonly aiIssues = new Map<string, string>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: ChatSettingsService,
    private readonly chat: ChatService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => { void this.tick().catch(error => this.logger.error(error)); }, 5000);
    void this.tick().catch(error => this.logger.error(error));
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: Outbound) { for (const listener of this.listeners) listener(event); }

  private async locked<T>(roomId: string, userId: string | null, task: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "mafia:" + roomId);
      const room = await tx.room.findUnique({ where: { id: roomId }, select: { isMafiaRoom: true } });
      if (!room) throw new NotFoundException("Комната не найдена");
      if (!room.isMafiaRoom && userId) throw new BadRequestException("В этой комнате режим «Мафия» выключен");
      if (userId) {
        const member = await tx.roomMembership.findUnique({ where: { userId_roomId: { userId, roomId } } });
        if (!member) throw new ForbiddenException("Сначала войдите в комнату");
      }
      return task(tx);
    });
  }

  private active(tx: Prisma.TransactionClient, roomId: string) {
    return tx.mafiaGame.findFirst({
      where: { roomId, phase: { not: MafiaPhase.FINISHED } },
      include: { players: { orderBy: { joinedAt: "asc" } }, votes: true },
      orderBy: { createdAt: "desc" },
    });
  }

  private requireGame(game: FullGame | null): FullGame {
    if (!game) throw new BadRequestException("В комнате нет активной партии");
    return game;
  }

  private requireHost(game: FullGame, userId: string) {
    if (game.hostUserId !== userId) throw new ForbiddenException("Это действие доступно только ведущему");
  }

  async create(roomId: string, userId: string, name: string) {
    await this.locked(roomId, userId, async tx => {
      if (await this.active(tx, roomId)) throw new BadRequestException("Партия уже идёт");
      await tx.mafiaGame.create({ data: { roomId, hostUserId: userId, players: { create: { userId, name } } } });
    });
    await this.publish(roomId, "mafia:lobby-updated");
    return this.status(roomId, userId);
  }

  async createTest(roomId: string, userId: string, name: string, botCount: number) {
    if (!Number.isInteger(botCount) || botCount < 3 || botCount > 11) throw new BadRequestException("Можно добавить от 3 до 11 ботов");
    await this.locked(roomId, userId, async tx => {
      const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (actor?.role !== "ADMIN") throw new ForbiddenException("Тестовую игру с ИИ-ботами может создать только администратор");
      if (await this.active(tx, roomId)) throw new BadRequestException("Партия уже идёт");
      const game = await tx.mafiaGame.create({ data: { roomId, hostUserId: userId, isTestMode: true, players: { create: { userId, name } } } });
      const names = ["Алиса", "Борис", "Вера", "Глеб", "Даша", "Егор", "Женя", "Зоя", "Илья", "Кира", "Лев"];
      for (let index = 0; index < botCount; index++) {
        const bot = await tx.user.create({ data: {
          username: "mafia_ai_" + randomUUID().replace(/-/g, "").slice(0, 18),
          displayName: names[index] + " · ИИ", isBot: true, credits: 0,
        } });
        await tx.mafiaPlayer.create({ data: { gameId: game.id, userId: bot.id, name: bot.displayName, isAiBot: true } });
      }
    });
    await this.publish(roomId, "mafia:lobby-updated");
    return this.status(roomId, userId);
  }

  async sendTestMessage(roomId: string, userId: string, body: string, audience: string, recipientUserId?: string) {
    const clean = body.trim();
    if (!clean || clean.length > 1000) throw new BadRequestException("Сообщение должно содержать от 1 до 1000 символов");
    if (!["ALL", "MAFIA", "DOCTOR", "COMMISSAR", "PLAYER"].includes(audience)) throw new BadRequestException("Некорректный адресат");
    const message = await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      if (!game.isTestMode || game.phase === MafiaPhase.LOBBY) throw new BadRequestException("Адресный чат доступен только во время тестовой игры");
      const actor = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, displayName: true } });
      const player = game.players.find(item => item.userId === userId);
      if (actor.role !== "ADMIN" && (!player?.isAlive || audience !== "ALL" && !(audience === "MAFIA" && player.role === MafiaRole.MAFIA)))
        throw new ForbiddenException("Этот канал вам недоступен");
      if (audience === "PLAYER" && !game.players.some(item => item.userId === recipientUserId))
        throw new BadRequestException("Адресат не участвует в игре");
      return tx.mafiaTestMessage.create({ data: { gameId: game.id, round: game.round, phase: game.phase, authorUserId: userId,
        authorName: actor.displayName, audience, recipientUserId: audience === "PLAYER" ? recipientUserId : null, body: clean } });
    });
    await this.publishTestMessage(roomId, message);
    return { ok: true };
  }

  async advanceTest(roomId: string, userId: string) {
    const game = await this.locked(roomId, userId, async tx => {
      const active = this.requireGame(await this.active(tx, roomId));
      this.requireHost(active, userId);
      if (!active.isTestMode || active.phase === MafiaPhase.LOBBY) throw new BadRequestException("Это не активная тестовая партия");
      await tx.mafiaGame.update({ where: { id: active.id }, data: { phaseEndsAt: new Date(Date.now() - 1000) } });
      return active.id;
    });
    const transition = await this.advance(roomId, game);
    if (transition) await this.announceTransition(transition);
    return this.status(roomId, userId);
  }

  async join(roomId: string, userId: string, name: string) {
    await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      if (game.phase !== MafiaPhase.LOBBY) throw new BadRequestException("Партия уже началась");
      if (game.players.some(player => player.userId === userId)) return;
      if (game.players.length >= 12) throw new BadRequestException("Максимум 12 игроков");
      await tx.mafiaPlayer.create({ data: { gameId: game.id, userId, name } });
    });
    await this.publish(roomId, "mafia:lobby-updated");
    return this.status(roomId, userId);
  }

  async start(roomId: string, userId: string) {
    const { settings } = await this.settings.read();
    await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      this.requireHost(game, userId);
      if (game.phase !== MafiaPhase.LOBBY) throw new BadRequestException("Партия уже началась");
      if (game.players.length < 4 || game.players.length > 12) throw new BadRequestException("Для игры нужно от 4 до 12 участников");
      const count = game.players.length;
      const roles = mafiaRoleDeck(count);
      for (let index = roles.length - 1; index > 0; index--) {
        const swap = randomInt(index + 1);
        [roles[index], roles[swap]] = [roles[swap], roles[index]];
      }
      for (let index = 0; index < count; index++)
        await tx.mafiaPlayer.update({ where: { id: game.players[index].id }, data: { role: roles[index] } });
      await tx.mafiaGame.update({ where: { id: game.id }, data: { phase: MafiaPhase.NIGHT, round: 1, phaseEndsAt: new Date(Date.now() + settings.mafiaNightSeconds * 1000) } });
    });
    await this.notice(roomId, "Игра «Мафия» началась. Наступила ночь. Ходит мафия.");
    await this.publish(roomId, "mafia:started");
    return this.status(roomId, userId);
  }

  async nightAction(roomId: string, userId: string, type: MafiaNightActionType, targetUserId: string) {
    await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      if (game.phase !== MafiaPhase.NIGHT || !game.phaseEndsAt || game.phaseEndsAt <= new Date()) throw new BadRequestException("Ночь уже закончилась");
      const actor = game.players.find(player => player.userId === userId);
      const target = game.players.find(player => player.userId === targetUserId);
      if (!actor?.isAlive || !target?.isAlive) throw new ForbiddenException("Действовать могут только живые игроки");
      const expected = actor.role === MafiaRole.MAFIA ? MafiaNightActionType.MAFIA_KILL
        : actor.role === MafiaRole.DOCTOR ? MafiaNightActionType.DOCTOR_PROTECT
        : actor.role === MafiaRole.COMMISSAR ? MafiaNightActionType.COMMISSAR_CHECK : null;
      if (expected !== type) throw new ForbiddenException("Это действие недоступно вашей роли");
      if (type === MafiaNightActionType.MAFIA_KILL && target.role === MafiaRole.MAFIA) throw new BadRequestException("Нельзя выбрать союзника");
      if (type === MafiaNightActionType.COMMISSAR_CHECK && target.userId === userId) throw new BadRequestException("Комиссар проверяет другого игрока");
      await tx.mafiaNightAction.upsert({
        where: { gameId_round_actorUserId_type: { gameId: game.id, round: game.round, actorUserId: userId, type } },
        create: { gameId: game.id, round: game.round, actorUserId: userId, type, targetUserId },
        update: { targetUserId },
      });
    });
    this.emit({ roomId, event: "mafia:private-state", userId, payload: await this.status(roomId, userId) });
    return { ok: true };
  }

  async startVote(roomId: string, userId: string) {
    const { settings } = await this.settings.read();
    await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      this.requireHost(game, userId);
      if (game.phase !== MafiaPhase.DAY || !game.phaseEndsAt || game.phaseEndsAt <= new Date()) throw new BadRequestException("Сейчас нельзя начать голосование");
      if (!game.players.find(player => player.userId === userId)?.isAlive) throw new ForbiddenException("Выбывший ведущий ждёт автоматического начала голосования");
      await tx.mafiaGame.update({ where: { id: game.id }, data: { phase: MafiaPhase.VOTING, phaseEndsAt: new Date(Date.now() + settings.mafiaVotingSeconds * 1000) } });
    });
    await this.notice(roomId, "Началось голосование. Живые игроки могут выбрать кандидата или воздержаться.");
    await this.publish(roomId, "mafia:phase-changed");
    return this.status(roomId, userId);
  }

  async vote(roomId: string, userId: string, targetUserId: string | null) {
    const result = await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      if (game.phase !== MafiaPhase.VOTING || !game.phaseEndsAt || game.phaseEndsAt <= new Date()) throw new BadRequestException("Голосование закрыто");
      const voter = game.players.find(player => player.userId === userId);
      const target = targetUserId ? game.players.find(player => player.userId === targetUserId) : null;
      if (!voter?.isAlive) throw new ForbiddenException("Голосовать могут только живые игроки");
      if (targetUserId && !target?.isAlive) throw new BadRequestException("Кандидат должен быть живым игроком");
      await tx.mafiaVote.upsert({
        where: { gameId_round_voterUserId: { gameId: game.id, round: game.round, voterUserId: userId } },
        create: { gameId: game.id, round: game.round, voterUserId: userId, targetUserId },
        update: { targetUserId },
      });
      return { voter: voter.name, target: target?.name ?? null };
    });
    await this.notice(roomId, result.target ? `${result.voter} голосует против ${result.target}.` : `${result.voter} воздерживается.`);
    await this.publish(roomId, "mafia:vote-cast", { voterUserId: userId, targetUserId });
    return this.status(roomId, userId);
  }

  async stop(roomId: string, userId: string) {
    await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      this.requireHost(game, userId);
      await tx.mafiaGame.update({ where: { id: game.id }, data: { phase: MafiaPhase.FINISHED, phaseEndsAt: null, winner: "STOPPED" } });
    });
    await this.notice(roomId, "Ведущий остановил игру «Мафия».");
    await this.publish(roomId, "mafia:finished");
    return this.status(roomId, userId);
  }

  async secretChat(roomId: string, userId: string, body: string) {
    const clean = body.trim();
    if (!clean || clean.length > 1000) throw new BadRequestException("Сообщение должно содержать от 1 до 1000 символов");
    const result = await this.locked(roomId, userId, async tx => {
      const game = this.requireGame(await this.active(tx, roomId));
      const actor = game.players.find(player => player.userId === userId);
      if (game.phase !== MafiaPhase.NIGHT || !game.phaseEndsAt || game.phaseEndsAt <= new Date() || !actor?.isAlive || actor.role !== MafiaRole.MAFIA)
        throw new ForbiddenException("Тайный чат доступен только живой мафии ночью");
      const message = await tx.mafiaSecretMessage.create({ data: { gameId: game.id, round: game.round, authorUserId: userId, authorName: actor.name, body: clean } });
      return { message: { id: message.id, authorUserId: userId, authorName: actor.name, body: clean, createdAt: message.createdAt.toISOString() },
        allies: game.players.filter(player => player.isAlive && player.role === MafiaRole.MAFIA).map(player => player.userId), isTestMode: game.isTestMode };
    });
    const recipients = new Set(result.allies);
    if (result.isTestMode) {
      const admins = await this.prisma.roomMembership.findMany({ where: { roomId, user: { role: "ADMIN" } }, select: { userId: true } });
      for (const admin of admins) recipients.add(admin.userId);
    }
    for (const recipient of recipients) this.emit({ roomId, event: "mafia:secret-message", userId: recipient, payload: result.message });
    return { ok: true };
  }

  async status(roomId: string, userId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, select: { isMafiaRoom: true } });
    if (!room?.isMafiaRoom) throw new BadRequestException("Это не комната «Мафии»");
    const member = await this.prisma.roomMembership.findUnique({ where: { userId_roomId: { userId, roomId } } });
    if (!member) throw new ForbiddenException("Сначала войдите в комнату");
    const game = await this.prisma.mafiaGame.findFirst({
      where: { roomId }, orderBy: { createdAt: "desc" },
      include: { players: { orderBy: { joinedAt: "asc" } }, votes: true },
    });
    if (!game) return null;
    const publicState = this.publicState(game);
    const viewer = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const adminView = game.isTestMode && viewer?.role === "ADMIN";
    const self = game.players.find(player => player.userId === userId);
    const isLivingMafia = self?.isAlive && self.role === MafiaRole.MAFIA;
    const [myAction, myVote, checks, secretMessages, testMessages] = await Promise.all([
      self && game.phase === MafiaPhase.NIGHT ? this.prisma.mafiaNightAction.findFirst({ where: { gameId: game.id, round: game.round, actorUserId: userId } }) : null,
      self && game.phase === MafiaPhase.VOTING ? this.prisma.mafiaVote.findFirst({ where: { gameId: game.id, round: game.round, voterUserId: userId } }) : null,
      self?.role === MafiaRole.COMMISSAR ? this.prisma.mafiaNightAction.findMany({ where: { gameId: game.id, actorUserId: userId, type: MafiaNightActionType.COMMISSAR_CHECK, ...(game.phase === MafiaPhase.NIGHT ? { round: { lt: game.round } } : {}) }, orderBy: { round: "asc" } }) : [],
      isLivingMafia || adminView ? this.prisma.mafiaSecretMessage.findMany({ where: adminView ? { gameId: game.id } : { gameId: game.id, round: game.round }, orderBy: { createdAt: "asc" }, take: 200 }) : [],
      game.isTestMode ? this.prisma.mafiaTestMessage.findMany({ where: { gameId: game.id }, orderBy: { createdAt: "asc" }, take: 200 }) : [],
    ]);
    return {
      ...publicState,
      adminView,
      aiConfigured: adminView ? Boolean(process.env.AITUNNEL_API_KEY?.trim()) : undefined,
      aiIssue: adminView ? this.aiIssues.get(game.id) ?? null : undefined,
      adminRoles: adminView ? game.players.map(player => ({ userId: player.userId, role: player.role })) : [],
      testMessages: testMessages.filter(message => this.canReadTestMessage(message, self, Boolean(adminView)))
        .map(message => ({ id: message.id, authorUserId: message.authorUserId, authorName: message.authorName,
          audience: message.audience, recipientUserId: message.recipientUserId, body: message.body,
          round: message.round, phase: message.phase, createdAt: message.createdAt.toISOString() })),
      myRole: self?.role ?? null,
      myAlive: self?.isAlive ?? false,
      myActionTargetUserId: myAction?.targetUserId ?? null,
      myVoteTargetUserId: myVote?.targetUserId ?? null,
      allies: isLivingMafia ? game.players.filter(player => player.role === MafiaRole.MAFIA && player.isAlive).map(player => ({ userId: player.userId, name: player.name })) : [],
      checks: checks.map(action => ({ round: action.round, targetUserId: action.targetUserId, result: game.players.find(player => player.userId === action.targetUserId)?.role === MafiaRole.MAFIA ? "MAFIA" : "NOT_MAFIA" })),
      secretMessages: secretMessages.map(message => ({ id: message.id, authorUserId: message.authorUserId, authorName: message.authorName, body: message.body, createdAt: message.createdAt.toISOString() })),
    };
  }

  private publicState(game: FullGame) {
    return {
      gameId: game.id, roomId: game.roomId, hostUserId: game.hostUserId, phase: game.phase, isTestMode: game.isTestMode,
      round: game.round, phaseEndsAt: game.phaseEndsAt?.toISOString() ?? null, winner: game.winner,
      players: game.players.map(player => ({ userId: player.userId, name: player.name, isAlive: player.isAlive,
        joinedAt: player.joinedAt.toISOString(), isAiBot: player.isAiBot, role: !player.isAlive || game.phase === MafiaPhase.FINISHED ? player.role : undefined })),
      votes: game.phase === MafiaPhase.VOTING ? game.votes.filter(vote => vote.round === game.round).map(vote => ({ voterUserId: vote.voterUserId, targetUserId: vote.targetUserId })) : [],
    };
  }

  private async publish(roomId: string, event: string, extra: Record<string, unknown> = {}) {
    const game = await this.prisma.mafiaGame.findFirst({ where: { roomId }, orderBy: { createdAt: "desc" }, include: { players: { orderBy: { joinedAt: "asc" } }, votes: true } });
    if (!game) return;
    this.emit({ roomId, event, payload: { ...extra, state: this.publicState(game) } });
    for (const player of game.players) {
      try { this.emit({ roomId, event: "mafia:private-state", userId: player.userId, payload: await this.status(roomId, player.userId) }); }
      catch (error) { this.logger.warn("Не удалось обновить личное состояние игрока " + player.userId + ": " + error); }
    }
  }

  private async notice(roomId: string, body: string) {
    const message = await this.chat.createRoomSystemMessage(roomId, body);
    this.emit({ roomId, event: "message:created", payload: { roomId, message } });
  }

  private canReadTestMessage(message: { audience: string; recipientUserId: string | null }, viewer: { userId: string; role: MafiaRole | null } | undefined, admin: boolean) {
    if (admin || message.audience === "ALL") return true;
    if (!viewer) return false;
    if (message.audience === "PLAYER") return message.recipientUserId === viewer.userId;
    return message.audience === viewer.role;
  }

  private async publishTestMessage(roomId: string, message: MafiaTestMessage) {
    const players = await this.prisma.mafiaPlayer.findMany({ where: { gameId: message.gameId }, select: { userId: true, role: true } });
    const admins = await this.prisma.roomMembership.findMany({ where: { roomId, user: { role: "ADMIN" } }, select: { userId: true } });
    const recipients = new Set(admins.map(item => item.userId));
    for (const player of players) if (this.canReadTestMessage(message, player, false)) recipients.add(player.userId);
    const payload = { id: message.id, authorUserId: message.authorUserId, authorName: message.authorName,
      audience: message.audience, recipientUserId: message.recipientUserId, body: message.body,
      round: message.round, phase: message.phase, createdAt: message.createdAt.toISOString() };
    if (message.audience === "ALL") this.emit({ roomId, event: "mafia:test-message", payload });
    else for (const recipient of recipients) this.emit({ roomId, event: "mafia:test-message", userId: recipient, payload });
  }

  private async processTestBots(gameId: string) {
    if (this.processingTestGames.has(gameId)) return;
    this.processingTestGames.add(gameId);
    try {
      const game = await this.prisma.mafiaGame.findUnique({ where: { id: gameId }, include: { players: true, votes: true } });
      if (!game?.isTestMode || !(game.phase === MafiaPhase.NIGHT || game.phase === MafiaPhase.DAY || game.phase === MafiaPhase.VOTING)) return;
      for (const bot of game.players.filter(player => player.isAiBot && player.isAlive)) {
        const current = await this.prisma.mafiaGame.findUnique({ where: { id: gameId }, select: { phase: true, round: true, phaseEndsAt: true } });
        if (!current || current.phase !== game.phase || current.round !== game.round || !current.phaseEndsAt || current.phaseEndsAt <= new Date()) break;
        await this.botTurn(game, bot.userId);
      }
    } finally { this.processingTestGames.delete(gameId); }
  }

  private async botTurn(game: FullGame, botId: string) {
    const bot = game.players.find(player => player.userId === botId);
    if (!bot?.role) return;
    const living = game.players.filter(player => player.isAlive);
    const choices = game.phase === MafiaPhase.NIGHT
      ? bot.role === MafiaRole.MAFIA ? living.filter(player => player.role !== MafiaRole.MAFIA)
        : bot.role === MafiaRole.COMMISSAR ? living.filter(player => player.userId !== botId)
        : bot.role === MafiaRole.DOCTOR ? living : []
      : game.phase === MafiaPhase.VOTING ? living : [];
    const [allMessages, sent, mafiaActions, mafiaChat, myChecks] = await Promise.all([
      this.prisma.mafiaTestMessage.findMany({ where: { gameId: game.id }, orderBy: { createdAt: "desc" }, take: 60 }),
      this.prisma.mafiaTestMessage.findMany({ where: { gameId: game.id, authorUserId: botId, round: game.round, phase: game.phase }, select: { turnKey: true } }),
      bot.role === MafiaRole.MAFIA ? this.prisma.mafiaNightAction.findMany({ where: { gameId: game.id, round: game.round, type: MafiaNightActionType.MAFIA_KILL }, select: { targetUserId: true } }) : Promise.resolve([]),
      bot.role === MafiaRole.MAFIA ? this.prisma.mafiaSecretMessage.findMany({ where: { gameId: game.id, round: game.round },
        orderBy: { createdAt: "desc" }, take: 20, select: { authorName: true, body: true } }) : Promise.resolve([]),
      bot.role === MafiaRole.COMMISSAR ? this.prisma.mafiaNightAction.findMany({ where: {
        gameId: game.id, actorUserId: botId, type: MafiaNightActionType.COMMISSAR_CHECK,
        round: game.phase === MafiaPhase.NIGHT ? { lt: game.round } : { lte: game.round },
      }, select: { targetUserId: true } }) : Promise.resolve([]),
    ]);
    const visible = allMessages.filter(message => this.canReadTestMessage(message, bot, false));
    const latestHuman = visible.find(message => !game.players.some(player => player.userId === message.authorUserId && player.isAiBot));
    const baseKey = [game.id, game.round, game.phase, botId].join(":");
    const initialKey = baseKey + ":initial";
    const replyKey = latestHuman ? baseKey + ":" + latestHuman.id : null;
    const turnKey = !sent.some(item => item.turnKey === initialKey) ? initialKey
      : replyKey && !sent.some(item => item.turnKey === replyKey) && sent.length < 3 ? replyKey : null;
    if (!turnKey) return;
    const view = buildMafiaAiView({
      botId, phase: game.phase, round: game.round,
      players: game.players.map(player => ({ userId: player.userId, name: player.name, isAlive: player.isAlive, role: player.role })),
      allowedTargets: choices.map(player => ({ userId: player.userId, name: player.name })),
      publicChat: allMessages.filter(message => message.audience === "ALL").reverse().map(message => ({ authorName: message.authorName, body: message.body })),
      directedMessages: allMessages.filter(message => message.audience !== "ALL").reverse().map(message => ({
        authorName: message.authorName, audience: message.audience, recipientUserId: message.recipientUserId, body: message.body,
      })),
      mafiaChat: mafiaChat.reverse(),
      checks: myChecks,
      mafiaAllyChoices: mafiaActions.map(action => action.targetUserId),
    });
    const audience = view.audience;
    let decision: MafiaAiDecision | null = null;
    const key = process.env.AITUNNEL_API_KEY?.trim();
    if (key) {
      try {
        decision = await requestMafiaAiDecision(view, key);
        this.aiIssues.delete(game.id);
      } catch (error) {
        const issue = error instanceof Error && error.message.startsWith("AITunnel HTTP") ? error.message : "Ошибка ответа AITunnel";
        this.aiIssues.set(game.id, issue);
        this.logger.warn("ИИ-ход «Мафии»: " + issue);
      }
    } else this.aiIssues.set(game.id, "Ключ AITUNNEL_API_KEY не задан");
    const preferred = bot.role === MafiaRole.MAFIA ? choices.find(player => player.userId === mafiaActions[0]?.targetUserId) : undefined;
    const target = choices.find(player => player.userId === decision?.targetUserId) ?? preferred ?? (choices.length ? choices[randomInt(choices.length)] : null);
    const body = decision?.message || (latestHuman && replyKey === turnKey ? "Я услышал твоё сообщение. Подумаю над этим."
      : game.phase === MafiaPhase.NIGHT ? bot.role === MafiaRole.MAFIA ? "Предлагаю согласовать цель этой ночью." : "Я сделал свой ночной выбор."
      : game.phase === MafiaPhase.VOTING ? "Я определился с голосом." : "Давайте обсудим, кто вызывает подозрение.");
    const result = await this.locked(game.roomId, null, async tx => {
      const current = await tx.mafiaGame.findUnique({ where: { id: game.id }, select: { phase: true, round: true, phaseEndsAt: true } });
      if (current?.phase !== game.phase || current.round !== game.round || !current.phaseEndsAt || current.phaseEndsAt <= new Date()) return null;
      if (await tx.mafiaTestMessage.findUnique({ where: { turnKey } })) return null;
      if (target && game.phase === MafiaPhase.NIGHT && bot.role !== MafiaRole.CIVILIAN) {
        const type = bot.role === MafiaRole.MAFIA ? MafiaNightActionType.MAFIA_KILL
          : bot.role === MafiaRole.DOCTOR ? MafiaNightActionType.DOCTOR_PROTECT : MafiaNightActionType.COMMISSAR_CHECK;
        await tx.mafiaNightAction.upsert({ where: { gameId_round_actorUserId_type: { gameId: game.id, round: game.round, actorUserId: botId, type } },
          create: { gameId: game.id, round: game.round, actorUserId: botId, type, targetUserId: target.userId }, update: { targetUserId: target.userId } });
      }
      if (game.phase === MafiaPhase.VOTING) {
        await tx.mafiaVote.upsert({ where: { gameId_round_voterUserId: { gameId: game.id, round: game.round, voterUserId: botId } },
          create: { gameId: game.id, round: game.round, voterUserId: botId, targetUserId: target?.userId ?? null },
          update: { targetUserId: target?.userId ?? null } });
      }
      return tx.mafiaTestMessage.create({ data: { gameId: game.id, round: game.round, phase: game.phase,
        authorUserId: botId, authorName: bot.name, audience, recipientUserId: audience === "PLAYER" ? botId : null, body, turnKey } });
    });
    if (result) {
      await this.publishTestMessage(game.roomId, result);
      if (game.phase === MafiaPhase.VOTING) {
        await this.notice(game.roomId, target ? bot.name + " голосует против " + target.name + "." : bot.name + " воздерживается.");
        await this.publish(game.roomId, "mafia:vote-cast", { voterUserId: botId, targetUserId: target?.userId ?? null });
      }
    }
  }

  private async tick() {
    const expired = await this.prisma.mafiaGame.findMany({
      where: { phase: { in: [MafiaPhase.NIGHT, MafiaPhase.DAY, MafiaPhase.VOTING] }, phaseEndsAt: { lte: new Date() } },
      select: { id: true, roomId: true }, take: 50,
    });
    for (const game of expired) {
      try { const transition = await this.advance(game.roomId, game.id); if (transition) await this.announceTransition(transition); }
      catch (error) { this.logger.error("Ошибка перехода фазы игры " + game.id, error); }
    }
    const tests = await this.prisma.mafiaGame.findMany({ where: { isTestMode: true, phase: { in: [MafiaPhase.NIGHT, MafiaPhase.DAY, MafiaPhase.VOTING] } }, select: { id: true }, take: 20 });
    for (const game of tests) void this.processTestBots(game.id).catch(error => this.logger.error("Ошибка локальных ботов Mafia " + game.id, error));
  }

  private async advance(roomId: string, gameId: string): Promise<Transition | null> {
    const { settings } = await this.settings.read();
    return this.locked(roomId, null, async tx => {
      const game = await tx.mafiaGame.findUnique({ where: { id: gameId }, include: { players: true, votes: true } });
      if (!game || game.phase === MafiaPhase.FINISHED || !game.phaseEndsAt || game.phaseEndsAt > new Date()) return null;
      if (game.phase === MafiaPhase.DAY) {
        await tx.mafiaGame.update({ where: { id: game.id }, data: { phase: MafiaPhase.VOTING, phaseEndsAt: new Date(Date.now() + settings.mafiaVotingSeconds * 1000) } });
        return { roomId, event: "mafia:phase-changed", notice: "Обсуждение закончено. Началось голосование." };
      }
      let eliminated: Transition["eliminated"];
      if (game.phase === MafiaPhase.NIGHT) {
        const actions = await tx.mafiaNightAction.findMany({ where: { gameId: game.id, round: game.round } });
        const targetId = mafiaNightVictim(game.players, actions);
        const victim = targetId ? game.players.find(player => player.userId === targetId && player.isAlive) : null;
        if (victim?.role) {
          await tx.mafiaPlayer.update({ where: { id: victim.id }, data: { isAlive: false } });
          victim.isAlive = false;
          eliminated = { userId: victim.userId, name: victim.name, role: victim.role };
        }
      } else {
        const targetId = mafiaVoteTarget(game.votes.filter(vote => vote.round === game.round));
        const victim = targetId ? game.players.find(player => player.userId === targetId && player.isAlive) : null;
        if (victim?.role) {
          await tx.mafiaPlayer.update({ where: { id: victim.id }, data: { isAlive: false } });
          victim.isAlive = false;
          eliminated = { userId: victim.userId, name: victim.name, role: victim.role };
        }
      }
      const winner = mafiaWinner(game.players);
      const nextPhase = winner ? MafiaPhase.FINISHED : game.phase === MafiaPhase.NIGHT ? MafiaPhase.DAY : MafiaPhase.NIGHT;
      const nextRound = game.phase === MafiaPhase.VOTING && !winner ? game.round + 1 : game.round;
      const duration = nextPhase === MafiaPhase.DAY ? settings.mafiaDaySeconds : settings.mafiaNightSeconds;
      await tx.mafiaGame.update({ where: { id: game.id }, data: {
        phase: nextPhase, round: nextRound, winner, phaseEndsAt: winner ? null : new Date(Date.now() + duration * 1000),
      } });
      const roleName = eliminated?.role === MafiaRole.MAFIA ? "мафия" : eliminated?.role === MafiaRole.DOCTOR ? "доктор" : eliminated?.role === MafiaRole.COMMISSAR ? "комиссар" : "мирный";
      const outcome = eliminated ? `${eliminated.name} выбыл(а). Роль: ${roleName}.` : "Никто не выбыл.";
      const notice = game.phase === MafiaPhase.NIGHT ? `Наступил день. ${outcome}` : `Голосование окончено. ${outcome}` + (winner ? "" : " Наступила ночь. Ходит мафия.");
      return { roomId, event: game.phase === MafiaPhase.NIGHT ? "mafia:night-result" : "mafia:phase-changed",
        payload: { eliminated, winner }, eliminated, notice: winner ? notice + (winner === "MAFIA" ? " Победила мафия." : " Победили мирные.") : notice };
    });
  }

  private async announceTransition(transition: Transition) {
    if (transition.notice) await this.notice(transition.roomId, transition.notice);
    await this.publish(transition.roomId, transition.event, transition.payload);
    if (transition.eliminated) await this.publish(transition.roomId, "mafia:player-eliminated", { player: transition.eliminated });
    if (transition.payload?.winner) await this.publish(transition.roomId, "mafia:finished", { winner: transition.payload.winner });
    else await this.publish(transition.roomId, "mafia:phase-changed");
  }
}

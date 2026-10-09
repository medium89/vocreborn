import { randomInt } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { EconomyEntryType, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ChatSettingsService, type ChatSettings } from "../settings/chat-settings.service";

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export type CasinoColor = "red" | "black" | "green";

export function rouletteColor(number: number): CasinoColor {
  return number === 0 ? "green" : RED_NUMBERS.has(number) ? "red" : "black";
}

const RED_VALUES = Array.from(RED_NUMBERS);
const BLACK_VALUES = Array.from({ length: 36 }, (_, index) => index + 1).filter(number => !RED_NUMBERS.has(number));

export function randomRouletteNumber() {
  const roll = randomInt(197);
  if (roll < 3) return 0;
  return roll < 100 ? RED_VALUES[randomInt(RED_VALUES.length)] : BLACK_VALUES[randomInt(BLACK_VALUES.length)];
}

export function jackpotChance(jackpot: number, bet: number, settings: ChatSettings) {
  if (bet < settings.casinoJackpotMinBet) return 0;
  const tickets = Math.max(1, Math.floor(Math.sqrt(bet / settings.casinoJackpotCreditsPerTicket)));
  const chancePerTicket = settings.casinoJackpotBasePerTicketPerMillion + Math.floor(jackpot / 100000) * settings.casinoJackpotGrowthPer100000PerTicketPerMillion;
  return Math.min(settings.casinoJackpotMaxPerMillion, tickets * chancePerTicket);
}

export function roulettePayout(bet: number, choice: CasinoColor, color: CasinoColor, settings: ChatSettings) {
  if (choice !== color) return 0;
  const multiplier = choice === "green" ? settings.casinoGreenPayoutBps : 20000;
  return Math.floor(bet * multiplier / 10000);
}

@Injectable()
export class CasinoService {
  constructor(private readonly prisma: PrismaService, private readonly settings: ChatSettingsService) {}

  async state(userId: string) {
    const [state, player, config, recent] = await Promise.all([
      this.prisma.casinoState.findUnique({ where: { id: "main" } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
      this.settings.read(),
      this.prisma.casinoSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);
    if (!player) throw new ForbiddenException("Аккаунт не найден");
    const jackpot = state?.jackpot ?? 0;
    return { balance: player.credits, jackpot, settings: this.publicSettings(config.settings), recent };
  }

  async spin(userId: string, requestId: string, choice: CasinoColor, bet: number) {
    const saved = await this.prisma.casinoSpin.findUnique({ where: { requestId } });
    if (saved) {
      if (saved.userId !== userId) throw new ForbiddenException("Чужая ставка");
      return saved;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(284732)`;
          const existing = await tx.casinoSpin.findUnique({ where: { requestId } });
          if (existing) {
            if (existing.userId !== userId) throw new ForbiddenException("Чужая ставка");
            return existing;
          }
          const { settings } = await this.settings.read(tx);
          if (!settings.casinoEnabled) throw new ForbiddenException("Казино сейчас закрыто");
          if (bet < settings.casinoMinBet || bet > settings.casinoMaxBet)
            throw new BadRequestException(`Ставка должна быть от ${settings.casinoMinBet} до ${settings.casinoMaxBet} кредитов`);
          const debit = await tx.user.updateMany({
            where: { id: userId, deletedAt: null, credits: { gte: bet } },
            data: { credits: { decrement: bet } },
          });
          if (!debit.count) throw new BadRequestException("Недостаточно кредитов для ставки");
          const state = await tx.casinoState.upsert({
            where: { id: "main" }, create: { id: "main" }, update: {},
          });
          const number = randomRouletteNumber();
          const color = rouletteColor(number);
          const payout = roulettePayout(bet, choice, color, settings);
          const pot = state.jackpot + (payout === 0 ? bet : 0);
          if (pot > 2147483647) throw new BadRequestException("Джекпот временно достиг лимита");
          const chance = jackpotChance(pot, bet, settings);
          const jackpotWon = pot > 0 && randomInt(1000000) < chance ? pot : 0;
          const jackpotAfter = jackpotWon ? 0 : pot;
          const credit = payout + jackpotWon;
          const debited = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
          if (debited.credits + credit > 2147483647) throw new BadRequestException("Баланс достиг лимита");
          const player = credit
            ? await tx.user.update({ where: { id: userId }, data: { credits: { increment: credit } }, select: { credits: true } })
            : debited;
          await tx.casinoState.update({ where: { id: "main" }, data: { jackpot: jackpotAfter } });
          const result = await tx.casinoSpin.create({ data: {
            requestId, userId, choice, number, color, bet, payout, jackpotWon,
            jackpotChancePerMillion: chance, balanceAfter: player.credits, jackpotAfter,
          } });
          await tx.economyEntry.create({ data: {
            userId, type: EconomyEntryType.CASINO_SPIN, creditsDelta: credit - bet,
            balanceAfter: player.credits, referenceKey: "casino:" + requestId,
          } });
          return result;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
        throw error;
      }
    }
    throw new BadRequestException("Не удалось провести ставку");
  }

  private publicSettings(settings: ChatSettings) {
    return {
      enabled: settings.casinoEnabled,
      minBet: settings.casinoMinBet,
      maxBet: settings.casinoMaxBet,
      redBlackPayoutBps: 20000,
      greenPayoutBps: settings.casinoGreenPayoutBps,
      jackpotMinBet: settings.casinoJackpotMinBet,
      jackpotCreditsPerTicket: settings.casinoJackpotCreditsPerTicket,
      jackpotBasePerTicketPerMillion: settings.casinoJackpotBasePerTicketPerMillion,
      jackpotGrowthPer100000PerTicketPerMillion: settings.casinoJackpotGrowthPer100000PerTicketPerMillion,
      jackpotMaxPerMillion: settings.casinoJackpotMaxPerMillion,
    };
  }
}

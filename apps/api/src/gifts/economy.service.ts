import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

const RATING_COOLDOWN_MS = 5 * 60 * 1000;
const DAILY_RATING_LIMIT = 20;
const DAILY_CREDIT_REWARD = 5;

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);
  constructor(private readonly prisma: PrismaService) {}

  async awardForPublicMessage(userId: string, messageId: string, body: string) {
    if (body.trim().length < 3) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => this.award(tx, userId, messageId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
          this.logger.error("Не удалось начислить рейтинг за сообщение", error instanceof Error ? error.stack : undefined);
          return;
        }
      }
    }
  }

  private async award(tx: Prisma.TransactionClient, userId: string, messageId: string) {
    const existing = await tx.economyEntry.findUnique({ where: { messageId } });
    if (existing) return;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const now = new Date(); const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const sameDay = user.ratingAwardDay?.getTime() === dayStart.getTime();
    const awardsToday = sameDay ? user.ratingAwardsToday : 0;
    const tooSoon = user.lastRatingAt && now.getTime() - user.lastRatingAt.getTime() < RATING_COOLDOWN_MS;
    if (tooSoon || awardsToday >= DAILY_RATING_LIMIT) return;
    const creditsDelta = sameDay ? 0 : DAILY_CREDIT_REWARD;
    const updated = await tx.user.update({ where: { id: userId }, data: { rating: { increment: 1 }, credits: { increment: creditsDelta }, lastRatingAt: now, ratingAwardDay: dayStart, ratingAwardsToday: awardsToday + 1 } });
    await tx.economyEntry.create({ data: { userId, type: "MESSAGE_RATING", ratingDelta: 1, creditsDelta: 0, balanceAfter: updated.credits, messageId } });
    if (creditsDelta) await tx.economyEntry.create({ data: { userId, type: "DAILY_ACTIVITY_CREDIT", creditsDelta, balanceAfter: updated.credits } });
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { DailyActivityAction, EconomyEntryType, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

const DAILY_REWARDS: Record<DailyActivityAction, { credits: number; entryType: EconomyEntryType }> = {
  [DailyActivityAction.FIRST_MESSAGE]: { credits: 5, entryType: EconomyEntryType.DAILY_FIRST_MESSAGE },
  [DailyActivityAction.FIRST_REPLY]: { credits: 3, entryType: EconomyEntryType.DAILY_FIRST_REPLY },
  [DailyActivityAction.PROFILE_COMMENT]: { credits: 4, entryType: EconomyEntryType.DAILY_PROFILE_COMMENT },
  [DailyActivityAction.PHOTO_LIKE]: { credits: 2, entryType: EconomyEntryType.DAILY_PHOTO_LIKE },
  [DailyActivityAction.PROFILE_POST_LIKE]: { credits: 2, entryType: EconomyEntryType.DAILY_PROFILE_POST_LIKE },
};

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);
  constructor(private readonly prisma: PrismaService) {}

  async awardForPublicMessage(userId: string, messageId: string, body: string, replyToAuthorId?: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.awardRating(tx, userId, messageId);
          if (body.trim().length < 3) return [];
          const rewards = [await this.grant(tx, userId, DailyActivityAction.FIRST_MESSAGE)];
          if (replyToAuthorId && replyToAuthorId !== userId) rewards.push(await this.grant(tx, userId, DailyActivityAction.FIRST_REPLY));
          return rewards.filter((reward): reward is DailyReward => Boolean(reward));
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) {
          this.logger.error("Не удалось начислить награду за сообщение", error instanceof Error ? error.stack : undefined);
          return [];
        }
      }
    }
    return [];
  }

  async awardDailyActivity(userId: string, action: DailyActivityAction) {
    try {
      return await this.prisma.$transaction((tx) => this.grant(tx, userId, action), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.logger.error("Не удалось начислить ежедневную награду", error instanceof Error ? error.stack : undefined);
      return null;
    }
  }

  private async awardRating(tx: Prisma.TransactionClient, userId: string, messageId: string) {
    const existing = await tx.economyEntry.findUnique({ where: { messageId } });
    if (existing) return;
    const updated = await tx.user.update({
      where: { id: userId },
      data: { rating: { increment: 1 } },
      select: { credits: true },
    });
    await tx.economyEntry.create({
      data: {
        userId,
        type: EconomyEntryType.MESSAGE_RATING,
        ratingDelta: 1,
        balanceAfter: updated.credits,
        messageId,
      },
    });
  }

  private async grant(tx: Prisma.TransactionClient, userId: string, action: DailyActivityAction): Promise<DailyReward | null> {
    const reward = DAILY_REWARDS[action];
    const day = utcDay(new Date());
    const created = await tx.dailyActivityReward.createMany({
      data: { userId, action, day, credits: reward.credits },
      skipDuplicates: true,
    });
    if (created.count === 0) return null;
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: reward.credits } },
      select: { credits: true },
    });
    await tx.economyEntry.create({
      data: {
        userId,
        type: reward.entryType,
        creditsDelta: reward.credits,
        balanceAfter: updated.credits,
      },
    });
    return { action, credits: reward.credits, balance: updated.credits };
  }
}

type DailyReward = { action: DailyActivityAction; credits: number; balance: number };

function utcDay(value: Date) {
  const day = new Date(value);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

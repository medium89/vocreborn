import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service";

export async function assertNotInChaos(prisma: Pick<PrismaService, "chaos">, userId: string) {
  const active = await prisma.chaos.findFirst({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { expiresAt: true },
  });
  if (active) throw new ForbiddenException("Хаос: общий чат, комментарии и траты кредитов недоступны до " + active.expiresAt.toLocaleString("ru-RU"));
}

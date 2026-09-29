import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const userId = "251e53c7-24ae-4ef8-856e-85d37be15eb9";
const username = "medium";
const intervalMs = 10_000;
let timer;
let busy = false;

async function stop(code = 0) {
  if (timer) clearInterval(timer);
  await prisma.$disconnect();
  process.exit(code);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, credits: true } });
    if (!user || user.username !== username) throw new Error("Целевой аккаунт не найден; списание остановлено.");
    if (user.credits <= 0) {
      console.log("Баланс равен нулю; списание остановлено.");
      await stop();
      return;
    }
    const amount = Math.min(randomInt(1, 101), user.credits);
    const result = await prisma.user.updateMany({
      where: { id: userId, username, deletedAt: null, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (result.count) console.log("−" + amount + " кредитов");
  } catch (error) {
    console.error(error);
    await stop(1);
  } finally {
    busy = false;
  }
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, credits: true } });
if (!user || user.username !== username) {
  console.error("Целевой аккаунт не найден; списание не запущено.");
  await stop(1);
} else {
  console.log("Тестовое списание для " + username + " запущено: 1–100 кредитов каждые 10 секунд. Баланс: " + user.credits + ".");
  timer = setInterval(() => void tick(), intervalMs);
}

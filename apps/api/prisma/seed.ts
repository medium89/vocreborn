import { MessageKind, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const room = { id: "main", name: "Главная", description: "Общая комната сообщества", tone: "lime", position: 0 };
  await prisma.room.upsert({
    where: { id: room.id },
    update: room,
    create: room,
  });

  const existingWelcome = await prisma.message.findFirst({
    where: { roomId: "main", kind: MessageKind.SYSTEM },
  });

  if (!existingWelcome) {
    await prisma.message.create({
      data: {
        roomId: "main",
        authorName: "Система",
        body: "Добро пожаловать в Aura.",
        kind: MessageKind.SYSTEM,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

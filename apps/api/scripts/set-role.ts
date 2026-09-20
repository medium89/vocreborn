import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [username, requestedRole] = process.argv.slice(2);
  const role = requestedRole?.toUpperCase() as UserRole | undefined;

  if (!username || !role || !Object.values(UserRole).includes(role)) {
    throw new Error("Использование: npm run user:role -- <username> <user|moderator|admin>");
  }

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user || user.deletedAt) throw new Error("Пользователь не найден: " + username);

  const updated = await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(updated.username + " → " + updated.role.toLowerCase());
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

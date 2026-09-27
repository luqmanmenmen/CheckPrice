const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const nik = "22054178";
  const user = await prisma.user.findUnique({ where: { nik } });
  console.log("User in DB:", user);
  if (user) {
    console.log("PIN in DB:", user.pin);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());

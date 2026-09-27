const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const d19 = await prisma.dailySales.findMany({ where: { date: new Date('2026-09-19T10:00:00.000Z') }, take: 1 });
  const d21 = await prisma.dailySales.findMany({ where: { date: new Date('2026-09-21T10:00:00.000Z') }, take: 1 });
  
  console.log("D19:", d19);
  console.log("D21:", d21);
}

check().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const allSales = await prisma.dailySales.findMany();
  console.log('Total DailySales:', allSales.length);
  console.log('Sample:', allSales[0]);
}

check().catch(console.error).finally(() => prisma.$disconnect());

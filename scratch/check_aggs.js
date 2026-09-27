const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const sales = await prisma.dailySales.groupBy({
    by: ['date'],
    _sum: {
      omzet: true,
      qtySold: true
    },
    orderBy: { date: 'asc' }
  });
  console.log("Current DB Aggregations:", sales);
}

check().catch(console.error).finally(() => prisma.$disconnect());

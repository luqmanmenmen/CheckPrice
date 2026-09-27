const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const sales = await prisma.dailySales.groupBy({
    by: ['date'],
    _count: {
      id: true,
    },
    orderBy: {
      date: 'asc'
    }
  });
  console.log("DailySales count by date:");
  sales.forEach(s => console.log(`${s.date.toISOString().split('T')[0]}: ${s._count.id} records`));
}

check().catch(console.error).finally(() => prisma.$disconnect());

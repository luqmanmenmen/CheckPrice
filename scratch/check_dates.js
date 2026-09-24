const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dates = await prisma.dailySales.groupBy({
    by: ['date'],
    _count: true
  });
  console.log("DailySales dates in DB:");
  console.log(dates);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

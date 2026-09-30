const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const history = await prisma.syncHistory.findMany({
    orderBy: { createdAt: 'desc' }
  });
  console.log('HISTORY:');
  console.dir(history);
  
  const sales = await prisma.dailySales.groupBy({
    by: ['date'],
    _sum: { qtySold: true, omzet: true }
  });
  console.log('SALES:');
  console.dir(sales);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

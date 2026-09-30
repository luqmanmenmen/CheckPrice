const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const dsCount = await prisma.dailySales.count();
  console.log('DAILY SALES COUNT:', dsCount);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

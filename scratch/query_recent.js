const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const recentProducts = await prisma.product.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5
  });
  console.dir(recentProducts);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

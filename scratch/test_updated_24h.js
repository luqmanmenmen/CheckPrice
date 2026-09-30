const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const count = await prisma.product.count({ where: { updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  console.log('Updated in last 24h:', count);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const p = await prisma.product.count({ where: { createdAt: { gte: new Date('2026-09-30T00:00:00.000Z') } } });
  console.log('Created today:', p);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

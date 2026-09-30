const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const p = await prisma.product.findFirst({ select: { updatedAt: true } });
  console.log('Sample updatedAt:', p.updatedAt);
  const tzOffset = p.updatedAt.getTimezoneOffset();
  console.log('TZ Offset:', tzOffset);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

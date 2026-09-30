const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const allSkus = ['61314165', '61313871'];
  const p = await prisma.product.findMany({ where: { sku: { in: allSkus } } });
  console.log('Found:', p.length);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

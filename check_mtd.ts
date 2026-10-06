import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const p = await prisma.product.aggregate({ _sum: { sales_mtd_retail: true } });
  console.log("Current Product Table MTD Retail:", p._sum.sales_mtd_retail);
}
run().catch(console.error).finally(() => prisma.$disconnect());

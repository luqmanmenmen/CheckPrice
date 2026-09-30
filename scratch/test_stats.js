const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const agg = await prisma.product.aggregate({
    _sum: {
      day_sales_retail: true,
      day_sales_unit: true,
      sales_mtd: true,
      sales_mtd_retail: true
    }
  });
  console.log(agg);
  
  const daily = await prisma.dailySales.findMany({
    take: 10,
    orderBy: { date: 'desc' }
  });
  console.log("Daily sales:", daily.length > 0 ? daily : "Empty");
}
main().catch(console.error);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Resetting all DailySales...");
  await prisma.dailySales.deleteMany({});
  
  console.log("Resetting all sales_mtd and sales_wtd to 0...");
  const res = await prisma.product.updateMany({
    data: {
      sales_mtd: 0,
      sales_wtd: 0,
    }
  });
  console.log(`Reset ${res.count} products.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

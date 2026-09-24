const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const negativeStock = await prisma.product.count({
    where: { stok: { lt: 0 } }
  });
  
  const negativeSales = await prisma.product.count({
    where: { sales_mtd: { lt: 0 } }
  });
  
  console.log(`Products with negative stock: ${negativeStock}`);
  console.log(`Products with negative sales: ${negativeSales}`);
  
  if (negativeStock > 0) {
    const samples = await prisma.product.findMany({
      where: { stok: { lt: 0 } },
      take: 2
    });
    console.log("Negative stock samples:", samples);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

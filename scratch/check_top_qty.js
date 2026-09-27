const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const sales = await prisma.dailySales.findMany({
    where: {
      date: {
        gte: new Date('2026-09-25T00:00:00.000Z'),
        lte: new Date('2026-09-25T23:59:59.999Z'),
      }
    },
    include: { product: true },
    orderBy: { qtySold: 'desc' },
    take: 10
  });

  for (const sale of sales) {
    const p = sale.product;
    console.log(`SKU: ${p.sku} - QTY: ${sale.qtySold} - OmzetPOS: ${sale.omzet} - HargaNormal: ${p.hargaNormal}`);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());

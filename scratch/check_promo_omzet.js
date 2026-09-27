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
    include: { product: true }
  });

  let totalPromoRev = 0;
  let totalPosRev = 0;
  let posPromoRev = 0;
  
  for (const sale of sales) {
    const p = sale.product;
    const isPromo = (p.hargaPromo !== null && p.hargaPromo > 0) || p.discountType !== null || p.diskon !== null;
    
    totalPosRev += sale.omzet;
    
    if (isPromo) {
      posPromoRev += sale.omzet;
      let unitPrice = p.hargaPromo || p.hargaNormal || 0;
      totalPromoRev += (unitPrice * sale.qtySold);
    }
  }

  console.log(`Total POS Rev: ${totalPosRev}`);
  console.log(`POS Promo Rev: ${posPromoRev}`);
  console.log(`Calc Promo Rev (unitPrice * qty): ${totalPromoRev}`);
}

check().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const promoAgg = await p.product.aggregate({
    where: { OR: [{ hargaPromo: { not: null } }, { diskon: { not: null } }] },
    _sum: { day_sales_retail: true, day_sales_unit: true }
  });
  const promoCount = await p.product.count({
    where: { OR: [{ hargaPromo: { not: null } }, { diskon: { not: null } }] }
  });
  // Sample promo products yang punya sales hari ini
  const promoSample = await p.product.findMany({
    where: {
      OR: [{ hargaPromo: { not: null } }, { diskon: { not: null } }],
      day_sales_retail: { gt: 0 }
    },
    take: 5,
    select: { sku: true, description: true, hargaPromo: true, diskon: true, day_sales_retail: true, day_sales_unit: true }
  });
  console.log('Produk berpromo aktif:', promoCount);
  console.log('Omzet Promo Hari Ini:', promoAgg._sum.day_sales_retail?.toLocaleString('id-ID'));
  console.log('Qty Promo Hari Ini:', promoAgg._sum.day_sales_unit);
  console.log('\nSample produk promo yg terjual hari ini:');
  promoSample.forEach(p => console.log(`  ${p.sku} | ${p.description?.substring(0,40)} | Promo: ${p.hargaPromo} | Diskon: ${p.diskon} | Day Sales: ${p.day_sales_retail?.toLocaleString('id-ID')}`));
}
main().catch(console.error).finally(() => p.$disconnect());

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const agg = await p.product.aggregate({
    _sum: { eoh_retail: true, sales_ytd_retail: true, day_sales_retail: true, sales_mtd_retail: true }
  });
  console.log('eoh_retail (Nilai Stok):', agg._sum.eoh_retail?.toLocaleString('id-ID'));
  console.log('sales_ytd_retail (Omzet YTD):', agg._sum.sales_ytd_retail?.toLocaleString('id-ID'));
  console.log('day_sales_retail (Omzet Hari Ini):', agg._sum.day_sales_retail?.toLocaleString('id-ID'));
  console.log('sales_mtd_retail (Omzet MTD):', agg._sum.sales_mtd_retail?.toLocaleString('id-ID'));
}
main().catch(console.error).finally(() => p.$disconnect());

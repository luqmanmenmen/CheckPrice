const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.product.count();
  console.log('Total di DB:', total);

  // Test various SKUs
  const testSkus = ['53784299', '13463728', '51717123', '80744441'];
  for (const sku of testSkus) {
    const found = await prisma.product.findFirst({ where: { sku } });
    console.log(`SKU ${sku}:`, found ? `FOUND | ${found.description.substring(0, 40)} | promo: ${found.hargaPromo}` : 'NOT FOUND');
  }

  // Check if there's a problem with SKU type (string vs number)
  // The Excel stores SKU as number, but DB stores as string
  const numericTest = await prisma.product.findFirst({ where: { sku: '53784299' } });
  console.log('\nString search "53784299":', numericTest ? 'FOUND' : 'NOT FOUND');

  await prisma.$disconnect();
}
main().catch(console.error);

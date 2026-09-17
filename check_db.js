const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.product.count();
  console.log('Total products in DB:', total);

  const sku = await prisma.product.findFirst({ where: { sku: '53784299' } });
  console.log('SKU 53784299:', sku ? 'FOUND - ' + sku.description.substring(0, 50) : 'NOT FOUND');

  const samples = await prisma.product.findMany({ take: 3 });
  samples.forEach(s => console.log('Sample:', s.sku, '|', s.description.substring(0, 40)));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

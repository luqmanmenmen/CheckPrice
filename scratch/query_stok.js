const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const allStok = await prisma.product.count({ where: { stok: 0 } });
  const allProducts = await prisma.product.count();
  console.log('PRODUCTS WITH STOK 0:', allStok, '/', allProducts);
  
  const sampleStok0 = await prisma.product.findFirst({ where: { stok: 0 } });
  console.log('SAMPLE STOK 0:', sampleStok0);
  
  const sampleStokNot0 = await prisma.product.findFirst({ where: { stok: { gt: 0 } } });
  console.log('SAMPLE STOK > 0:', sampleStokNot0);
}
run().catch(console.error).finally(()=>prisma.$disconnect());

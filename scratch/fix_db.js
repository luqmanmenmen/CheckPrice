const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const badPromos = await prisma.product.findMany({
    where: {
      hargaPromo: {
        in: [11, 21, 31, 41] // From B1G1, B2G1, etc
      },
      diskon: {
        contains: 'BXGY'
      }
    }
  });
  
  console.log(`Found ${badPromos.length} products with corrupted hargaPromo from BXGY`);
  
  // Fix them
  if (badPromos.length > 0) {
    const res = await prisma.product.updateMany({
      where: {
        id: { in: badPromos.map(p => p.id) }
      },
      data: {
        hargaPromo: null
      }
    });
    console.log(`Fixed ${res.count} products.`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

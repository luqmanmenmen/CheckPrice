const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Menghapus semua data...');
  
  await prisma.dailySales.deleteMany({});
  await prisma.poSuggestion.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.syncHistory.deleteMany({
    where: { type: 'PQ_HARIAN' }
  });
  
  console.log('Database berhasil di-reset menjadi kosong (0 data).');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetSales() {
  console.log("Menghapus histori DailySales yang ngaco...");
  await prisma.dailySales.deleteMany({});
  
  console.log("Mereset baseline MTD di produk kembali ke 0...");
  await prisma.product.updateMany({
    data: {
      sales_mtd: 0,
      sales_mtd_retail: 0
    }
  });

  console.log("Selesai! Silakan upload ulang file PQ dari yang paling lama ke yang terbaru.");
}

resetSales().catch(console.error).finally(() => prisma.$disconnect());

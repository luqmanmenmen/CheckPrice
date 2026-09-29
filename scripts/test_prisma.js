const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.product.createMany({
      data: [{
        sku: "TEST1",
        description: "TEST",
        hargaNormal: 0,
        article: undefined,
        stok: undefined
      }]
    });
    console.log("Success");
  } catch (err) {
    console.error("Error:", err.message);
  }
}
main().finally(() => process.exit(0));

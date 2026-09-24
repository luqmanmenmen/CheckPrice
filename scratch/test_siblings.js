const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const product = await prisma.product.findFirst({ where: { sku: '16626350' } });
  if (!product) {
    console.log("Product not found");
    return;
  }
  console.log("Found product:", product.description);
  const parts = product.description.split(":");
  if (parts.length > 1) {
    const parentName = parts[0].trim();
    console.log("Parent name:", parentName);
    const siblings = await prisma.product.findMany({
      where: { description: { startsWith: parentName + ":" } }
    });
    console.log(`Found ${siblings.length} siblings`);
    siblings.forEach(s => console.log(s.sku, s.description));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany({ select: { description: true }});
  const colors = new Set();
  for (const p of products) {
    const parts = p.description.split(':');
    if (parts.length > 1) {
      colors.add(parts[1].trim().toUpperCase());
    }
  }
  console.log(Array.from(colors).sort().join('\n'));
}
main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const nameMatches = await prisma.product.findMany({
    where: {
      description: {
        contains: 'w',
        mode: 'insensitive',
      }
    },
    take: 10,
  });
  console.log("Matches:", nameMatches.length);
  console.log(nameMatches.map(p => p.description));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())

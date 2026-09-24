const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const history = await prisma.syncHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(history);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

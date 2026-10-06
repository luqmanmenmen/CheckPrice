import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const syncs = await prisma.syncHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { fileName: true, fileUrl: true, createdAt: true }
  });
  console.log(syncs);
}
run().catch(console.error).finally(() => prisma.$disconnect());

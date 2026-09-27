const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const updated = await prisma.user.updateMany({
    where: { status: 'BREAK' },
    data: { status: 'OFFLINE' }
  });
  console.log(`Updated ${updated.count} users from BREAK to OFFLINE`);
}

fix().catch(console.error).finally(() => prisma.$disconnect());

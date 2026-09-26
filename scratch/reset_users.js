const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Resetting all user data...');
  // Delete in order of dependencies to avoid foreign key constraints
  await prisma.ticket.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.syncHistory.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('All user data has been reset successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { nik: "22054178" }
  });
  
  if (admin) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { name: "Luqman Arif (Supervisor IT)" }
    });
    console.log("Updated admin name in database.");
  } else {
    console.log("Admin not found.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

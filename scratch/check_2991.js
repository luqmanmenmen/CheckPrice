const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.product.findUnique({where:{id:2991}}).then(console.log).finally(()=>prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.dailySales.deleteMany({}).then(() => console.log('Wiped DailySales')).finally(() => prisma.$disconnect());

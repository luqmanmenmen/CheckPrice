const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.dailySales.findMany({ where: { date: new Date('2026-09-19T10:00:00.000Z') }, take: 5 }).then(console.log).finally(() => prisma.$disconnect());

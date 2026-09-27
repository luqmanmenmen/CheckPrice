const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.dailySales.findMany({ where: { date: new Date('2026-09-23T10:00:00.000Z') } }).then(res => {
  console.log('Count:', res.length);
  const sumOmzet = res.reduce((sum, item) => sum + item.omzet, 0);
  const sumQty = res.reduce((sum, item) => sum + item.qtySold, 0);
  console.log('Total Omzet:', sumOmzet);
  console.log('Total Qty:', sumQty);
  res.sort((a,b) => b.qtySold - a.qtySold);
  console.log('Top 5 Qty:', res.slice(0,5));
}).finally(() => prisma.$disconnect());

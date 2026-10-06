import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const ds = await prisma.dailySales.groupBy({
    by: ['date'],
    _count: { _all: true },
    _sum: { omzet: true, qtySold: true },
    orderBy: { date: 'desc' }
  });

  console.log("DailySales dates:");
  console.log(ds.map(d => ({
    date: d.date,
    count: d._count._all,
    omzet: d._sum.omzet,
    qtySold: d._sum.qtySold
  })));

  const syncs = await prisma.syncHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log("Recent SyncHistory:");
  console.log(syncs.map(s => ({
    fileName: s.fileName,
    createdAt: s.createdAt,
    records: s.records
  })));
}

check().catch(console.error).finally(() => prisma.$disconnect());

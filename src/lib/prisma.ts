import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl:
      process.env.DATABASE_URL ||
      "postgresql://postgres.lzynugpistiyhxqkgwmk:Kuman123!%4021@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
  });

// Selalu simpan instance di globalThis agar tidak membuat koneksi baru berulang kali di Vercel/Railway
globalForPrisma.prisma = prisma;

export default prisma;

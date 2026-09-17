import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: "postgresql://postgres.lzynugpistiyhxqkgwmk:Kuman123!%4021@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildPoolSafeDatabaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ||
    "postgresql://postgres.lzynugpistiyhxqkgwmk:Kuman123!%4021@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20";

  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "1");
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "20");
    }
    if ((u.port === "6543" || raw.includes("pooler.supabase.com")) && !u.searchParams.has("pgbouncer")) {
      u.searchParams.set("pgbouncer", "true");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: buildPoolSafeDatabaseUrl(),
  });

// Selalu simpan instance di globalThis agar tidak membuat koneksi baru berulang kali di Vercel/Railway
globalForPrisma.prisma = prisma;

export default prisma;

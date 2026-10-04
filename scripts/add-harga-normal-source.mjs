// Tambah kolom opsional hargaNormalSource (idempotent, tidak menyentuh data lama)
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.loadEnvFile(path.resolve("c:/Max Display/price-checker/.env"));
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hargaNormalSource" TEXT`);
const r = await prisma.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='Product' AND column_name='hargaNormalSource'`);
console.log(r);
await prisma.$disconnect();

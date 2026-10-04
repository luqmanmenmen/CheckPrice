// FASE 0: Backup semua kolom harga Product ke JSON (read-only terhadap DB)
// Usage: node scripts/backup-product-prices.mjs
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.loadEnvFile(path.resolve("c:/Max Display/price-checker/.env"));
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const rows = await prisma.product.findMany({
  select: {
    sku: true, hargaNormal: true, hargaPromo: true, diskon: true, discountType: true,
    acara: true, fromDate: true, toDate: true, promoFileName: true,
  },
  orderBy: { sku: "asc" },
});
await prisma.$disconnect();

const dir = path.resolve("c:/Max Display/price-checker/scratch/backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(dir, `backup_products_${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), count: rows.length, rows }));
console.log(`Backup OK: ${rows.length} produk -> ${file}`);

// ROLLBACK: kembalikan kolom harga Product persis seperti file backup.
// Usage: node scripts/rollback-product-prices.mjs scratch/backups/backup_products_XXXX.json --apply
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.loadEnvFile(path.resolve("c:/Max Display/price-checker/.env"));
const { PrismaClient } = require("@prisma/client");

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) { console.error("Sebutkan file backup."); process.exit(1); }
const { rows } = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
console.log(`Backup berisi ${rows.length} produk. Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
if (!apply) process.exit(0);

const prisma = new PrismaClient();
const CHUNK = 500;
await prisma.$transaction(async (tx) => {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const vals = [];
    const ph = chunk.map((r, j) => {
      const b = j * 9;
      vals.push(r.sku, r.hargaNormal, r.hargaPromo, r.diskon, r.discountType, r.acara, r.fromDate, r.toDate, r.promoFileName);
      return `($${b + 1}::text,$${b + 2}::double precision,$${b + 3}::double precision,$${b + 4}::text,$${b + 5}::text,$${b + 6}::text,$${b + 7}::text,$${b + 8}::text,$${b + 9}::text)`;
    });
    await tx.$executeRawUnsafe(`
      UPDATE "Product" p SET "hargaNormal"=v.hn,"hargaPromo"=v.hp,"diskon"=v.dk,"discountType"=v.dt,
        "acara"=v.ac,"fromDate"=v.fd,"toDate"=v.td,"promoFileName"=v.pf,"updatedAt"=CURRENT_TIMESTAMP
      FROM (VALUES ${ph.join(",")}) AS v(sku,hn,hp,dk,dt,ac,fd,td,pf) WHERE p.sku=v.sku`, ...vals);
  }
}, { timeout: 120000 });
await prisma.$disconnect();
console.log("Rollback selesai.");

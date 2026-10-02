import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const start = Date.now();
  console.log("Generating 20000 rows...");
  
  const values = [];
  for (let i = 0; i < 20000; i++) {
    values.push(`('TEST-SKU-${i}', 'DESC ${i}', 0, 10, 5, NOW())`);
  }
  
  const query = `
    INSERT INTO "Product" ("sku", "description", "hargaNormal", "stok", "sales_mtd", "updatedAt")
    VALUES ${values.join(",\n")}
    ON CONFLICT ("sku") DO UPDATE SET
      "description" = EXCLUDED."description",
      "stok" = EXCLUDED."stok",
      "sales_mtd" = EXCLUDED."sales_mtd",
      "updatedAt" = EXCLUDED."updatedAt";
  `;
  
  console.log("Executing raw query...");
  const dbStart = Date.now();
  await prisma.$executeRawUnsafe(query);
  console.log(`DB execution took ${Date.now() - dbStart}ms`);
  console.log(`Total took ${Date.now() - start}ms`);
  
  // Clean up
  await prisma.$executeRawUnsafe(`DELETE FROM "Product" WHERE "sku" LIKE 'TEST-SKU-%'`);
}

run().catch(console.error).finally(() => prisma.$disconnect());

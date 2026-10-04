import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const ANALYSIS_FILE = 'C:/Users/LUCKMEN/.gemini/antigravity-ide/brain/1453a1a0-5638-4a14-8bcf-608ce30bc7fb/scratch/analysis.json';

async function main() {
  console.log('Reading analysis data...');
  const data = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf8'));

  const wrongNormal = data.wrongNormal_vsPromo || [];
  
  if (wrongNormal.length === 0) {
    console.log('No price discrepancies to fix.');
    return;
  }

  console.log(`Found ${wrongNormal.length} price discrepancies from PROMO files.`);

  // Prepare batch update
  const chunkSize = 1000;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < wrongNormal.length; i += chunkSize) {
    const chunk = wrongNormal.slice(i, i + chunkSize);
    
    const values = [];
    const rowPlaceholders = [];
    let paramIndex = 1;

    for (const item of chunk) {
      rowPlaceholders.push(`($${paramIndex++}::text, $${paramIndex++}::double precision)`);
      values.push(item.sku, item.file); // item.file contains the truthNormal from PROMO
    }

    if (rowPlaceholders.length > 0) {
      try {
        const query = `
          UPDATE "Product" as p
          SET "hargaNormal" = v."newHargaNormal",
              "hargaNormalSource" = 'PROMO',
              "updatedAt" = CURRENT_TIMESTAMP
          FROM (VALUES ${rowPlaceholders.join(", ")}) AS v("sku", "newHargaNormal")
          WHERE p."sku" = v."sku"
        `;
        
        await prisma.$executeRawUnsafe(query, ...values);
        updated += rowPlaceholders.length;
        console.log(`Updated ${updated} / ${wrongNormal.length}...`);
      } catch (err) {
        console.error("Bulk raw update error:", err);
        failed += rowPlaceholders.length;
      }
    }
  }

  // Also fix from PQ where it's wrong based on stockPrice (only if not in promo)
  const wrongPq = data.pqStockPriceVsDb || [];
  if (wrongPq.length > 0) {
    console.log(`Found ${wrongPq.length} price discrepancies from PQ files.`);
    for (let i = 0; i < wrongPq.length; i += chunkSize) {
      const chunk = wrongPq.slice(i, i + chunkSize);
      
      const values = [];
      const rowPlaceholders = [];
      let paramIndex = 1;

      for (const item of chunk) {
        rowPlaceholders.push(`($${paramIndex++}::text, $${paramIndex++}::double precision)`);
        values.push(item.sku, item.stockPrice); // item.stockPrice contains the truthNormal from PQ EOH/BOY
      }

      if (rowPlaceholders.length > 0) {
        try {
          const query = `
            UPDATE "Product" as p
            SET "hargaNormal" = v."newHargaNormal",
                "hargaNormalSource" = 'PQ',
                "updatedAt" = CURRENT_TIMESTAMP
            FROM (VALUES ${rowPlaceholders.join(", ")}) AS v("sku", "newHargaNormal")
            WHERE p."sku" = v."sku"
          `;
          
          await prisma.$executeRawUnsafe(query, ...values);
          updated += rowPlaceholders.length;
          console.log(`Updated PQ ${updated} / ${wrongNormal.length + wrongPq.length}...`);
        } catch (err) {
          console.error("Bulk raw update error:", err);
          failed += rowPlaceholders.length;
        }
      }
    }
  }

  console.log(`\nRepair Summary:`);
  console.log(`- Successfully updated: ${updated}`);
  console.log(`- Failed: ${failed}`);

  // Re-run checking
  console.log('Prices repaired successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

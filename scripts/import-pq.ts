import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import csvParser from 'csv-parser';

const prisma = new PrismaClient();

const CSV_FILE_PATH = 'D:\\Website\\SUKO\\PQ\\POWER QUERY 19 SEPTEMBER 2026.csv';

interface Row {
  SKU: string;
  ITEM_DESCRIPTION: string;
  GROUP: string;
  DEPARTMENT: string;
  [key: string]: string;
}

async function main() {
  console.log(`Membaca file dari: ${CSV_FILE_PATH}`);
  
  const results: Row[] = [];
  
  fs.createReadStream(CSV_FILE_PATH)
    .pipe(csvParser())
    .on('data', (data: Row) => {
      if (data.SKU) {
        results.push(data);
      }
    })
    .on('end', async () => {
      console.log(`Berhasil membaca ${results.length} baris dari CSV.`);
      console.log('Mulai proses sinkronisasi ke database...');
      
      let newCount = 0;
      let updateCount = 0;
      let errorCount = 0;

      // Hapus duplikat berdasarkan SKU dari CSV jika ada, ambil data terakhir
      const uniqueSkus = new Map<string, Row>();
      for (const row of results) {
        uniqueSkus.set(row.SKU.trim(), row);
      }
      
      const uniqueArray = Array.from(uniqueSkus.values());
      console.log(`Terdapat ${uniqueArray.length} SKU unik untuk di-import.`);

      const CHUNK_SIZE = 50;
      
      for (let i = 0; i < uniqueArray.length; i += CHUNK_SIZE) {
        const chunk = uniqueArray.slice(i, i + CHUNK_SIZE);
        
        for (const row of chunk) {
          try {
            const sku = row.SKU.trim();
            const description = row.ITEM_DESCRIPTION ? row.ITEM_DESCRIPTION.trim() : '';
            const brand = row.GROUP ? row.GROUP.trim() : '';
            const dept = row.DEPARTMENT ? row.DEPARTMENT.trim() : '';
            
            const daySales = parseInt(row.DAY_SALES_UNIT || '0', 10);
            const wtdSales = parseInt(row.WTD_SAL_UNIT || '0', 10);
            const mtdSales = parseInt(row.MTD_SALES_UNIT || '0', 10);
            const stok = parseInt(row.EOH_UNIT || '0', 10);
            
            // Extract date from DATA_AS_OF column or default to today
            let dataDate = new Date();
            dataDate.setHours(0, 0, 0, 0); // Normalize to midnight

            if (row.DATA_AS_OF) {
              const d = new Date(row.DATA_AS_OF);
              if (!isNaN(d.getTime())) {
                d.setHours(0, 0, 0, 0);
                dataDate = d;
              }
            }

            // Periksa apakah sudah ada di DB
            const existing = await prisma.product.findUnique({
              where: { sku }
            });

            let productId;

            if (existing) {
              productId = existing.id;
              // Update saja (tanpa menyentuh harga)
              await prisma.product.update({
                where: { sku },
                data: {
                  description,
                  brand,
                  dept,
                  stok,
                  sales_wtd: wtdSales,
                  sales_mtd: mtdSales
                }
              });
              updateCount++;
            } else {
              // Insert baru dengan harga 0
              const newProd = await prisma.product.create({
                data: {
                  sku,
                  description,
                  brand,
                  dept,
                  stok,
                  sales_wtd: wtdSales,
                  sales_mtd: mtdSales,
                  hargaNormal: 0,
                }
              });
              productId = newProd.id;
              newCount++;
            }

            // Insert DailySales if there are sales today
            if (daySales > 0) {
              await prisma.dailySales.upsert({
                where: {
                  productId_date: {
                    productId: productId,
                    date: dataDate
                  }
                },
                update: {
                  qtySold: daySales
                },
                create: {
                  productId: productId,
                  date: dataDate,
                  qtySold: daySales
                }
              });
            }
          } catch (err) {
            errorCount++;
            console.error(`Gagal memproses SKU: ${row.SKU}`, err);
          }
        }
        
        // Progress log
        if ((i + CHUNK_SIZE) % 500 === 0 || i + CHUNK_SIZE >= uniqueArray.length) {
          console.log(`Progress: ${Math.min(i + CHUNK_SIZE, uniqueArray.length)} / ${uniqueArray.length}`);
        }
      }
      
      console.log('--- Selesai ---');
      console.log(`SKU Baru: ${newCount}`);
      console.log(`SKU Diupdate: ${updateCount}`);
      console.log(`SKU Error: ${errorCount}`);
      
      await prisma.$disconnect();
    });
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

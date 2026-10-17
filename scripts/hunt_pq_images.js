const fs = require('fs');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const pqPath = "D:\\Website\\SUKO\\PQ\\POWER QUERY 28 SEPTEMBER 2026.csv";

// Helper CSV parser
function parseCsvLine(line) {
  const row = [];
  let inQuotes = false;
  let curVal = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        curVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(curVal.trim());
      curVal = '';
    } else {
      curVal += c;
    }
  }
  row.push(curVal.trim());
  return row;
}

// Helper fetch HEAD dengan timeout cepat (2000ms)
async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

// Helper Matahari Suggest Search API
async function searchMatahariSuggest(query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://matahari.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const products = data?.resources?.results?.products || [];
    if (products.length > 0) {
      const p = products[0];
      const img = p.image || p.featured_image;
      if (img) {
        return img.startsWith('//') ? `https:${img}` : img;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function probeCdnAllAngles(sku) {
  const url1 = `https://cdn.shopify.com/s/files/1/0666/9212/0727/files/${sku}-1.jpg`;
  const exists = await checkUrl(url1);
  if (!exists) return null;

  const angles = await Promise.all([2, 3, 4, 5, 6].map(async (angle) => {
    const u = `https://cdn.shopify.com/s/files/1/0666/9212/0727/files/${sku}-${angle}.jpg`;
    const ok = await checkUrl(u);
    return ok ? u : null;
  }));

  return [url1, ...angles.filter(Boolean)];
}

async function main() {
  console.log("🚀 [Hunter PQ] Memulai pencarian foto untuk seluruh 7.520 SKU dari Power Query...");
  const startTime = Date.now();

  const fileStream = fs.createReadStream(pqPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headerFound = false;
  let colIndex = {};
  const pqRecords = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = parseCsvLine(line);
    if (!headerFound) {
      const upperRow = row.map(h => h.toUpperCase());
      if (upperRow.includes("SKU")) {
        upperRow.forEach((h, i) => colIndex[h] = i);
        headerFound = true;
      }
      continue;
    }

    const sku = row[colIndex["SKU"]]?.trim();
    if (!sku || sku.toUpperCase().includes("TOTAL")) continue;

    const brand = row[colIndex["GROUP"]] || row[colIndex["BRAND"]] || '';
    const dept = row[colIndex["DEPARTMENT"]] || row[colIndex["DEPT"]] || '';
    const art = row[colIndex["PARENT_NAME"]] || row[colIndex["ARTICLE"]] || '';
    const desc = row[colIndex["ITEM_DESCRIPTION"]] || row[colIndex["DESCRIPTION"]] || '';

    pqRecords.push({ sku, brand, dept, art, desc });
  }

  console.log(`📦 Terbaca ${pqRecords.length} record produk dari PQ.`);

  // Ambil SKU yang belum punya foto di Supabase
  const missingInDb = await prisma.product.findMany({
    where: {
      sku: { in: pqRecords.map(r => r.sku) },
      imageUrl: null
    },
    select: { sku: true, article: true, color: true, dept: true }
  });

  console.log(`🔍 Ditemukan ${missingInDb.length} SKU di Supabase yang belum memiliki foto.`);

  // 1. Probing CDN Matahari secara paralel (batch 30)
  const foundImages = []; // { sku, imageUrl, images }
  const batchSize = 30;
  let probedCount = 0;
  let cdnFound = 0;

  console.log(`\n📡 [Tahap 1] Probing langsung ke CDN Matahari...`);
  for (let i = 0; i < missingInDb.length; i += batchSize) {
    const chunk = missingInDb.slice(i, i + batchSize);
    await Promise.all(chunk.map(async (item) => {
      const gallery = await probeCdnAllAngles(item.sku);
      if (gallery && gallery.length > 0) {
        foundImages.push({
          sku: item.sku,
          imageUrl: gallery[0],
          images: gallery
        });
        cdnFound++;
      }
    }));
    probedCount += chunk.length;
    process.stdout.write(`⏳ Probing CDN: ${probedCount}/${missingInDb.length} (${cdnFound} galeri foto ditemukan)...\r`);
  }

  console.log(`\n✨ [Tahap 1 Selesai] Berhasil menemukan ${cdnFound} SKU memiliki foto langsung di CDN Matahari!`);

  // 2. Untuk SKU yang CDN 404, coba cari via Matahari Search Suggest API (khusus produk alas kaki / tas / aksesoris)
  const remainingMissing = missingInDb.filter(m => !foundImages.some(f => f.sku === m.sku));
  console.log(`\n🔎 [Tahap 2] Mencari ${remainingMissing.length} SKU via Matahari Search Suggest API...`);

  let searchFound = 0;
  const searchBatch = 20;

  for (let i = 0; i < remainingMissing.length; i += searchBatch) {
    const chunk = remainingMissing.slice(i, i + searchBatch);
    await Promise.all(chunk.map(async (item) => {
      // 1. Coba cari dengan SKU
      let img = await searchMatahariSuggest(item.sku);
      // 2. Jika tidak ada dan punya kode artikel pendek, coba artikel
      if (!img && item.article && item.article.length > 4 && item.article.length < 30) {
        img = await searchMatahariSuggest(item.article);
      }
      if (img) {
        foundImages.push({
          sku: item.sku,
          imageUrl: img,
          images: [img]
        });
        searchFound++;
      }
    }));
    process.stdout.write(`⏳ Search API: ${Math.min(i + searchBatch, remainingMissing.length)}/${remainingMissing.length} (${searchFound} foto ditemukan)...\r`);
  }

  console.log(`\n✨ [Tahap 2 Selesai] Berhasil menemukan ${searchFound} foto dari Matahari Search API!`);
  console.log(`🎉 Total foto baru yang siap diupdate ke Supabase: ${foundImages.length} SKU.`);

  // 3. Update Supabase PostgreSQL dalam batch 150
  if (foundImages.length > 0) {
    const updateBatchSize = 150;
    let updatedTotal = 0;

    for (let i = 0; i < foundImages.length; i += updateBatchSize) {
      const chunk = foundImages.slice(i, i + updateBatchSize);
      const valuesList = chunk.map(c => {
        const safeSku = c.sku.replace(/'/g, "''");
        const safePrimary = `'${c.imageUrl.replace(/'/g, "''")}'`;
        const arraySql = `ARRAY[${c.images.map(img => `'${img.replace(/'/g, "''")}'`).join(', ')}]::text[]`;
        return `('${safeSku}', ${safePrimary}, ${arraySql})`;
      }).join(", ");

      const sql = `
        UPDATE "Product" AS p
        SET "imageUrl" = c.img,
            "images" = c.imgs,
            "updatedAt" = NOW()
        FROM (VALUES ${valuesList}) AS c(sku, img, imgs)
        WHERE p.sku = c.sku
      `;

      try {
        const affected = await prisma.$executeRawUnsafe(sql);
        updatedTotal += affected;
      } catch (err) {
        console.error("Update error:", err.message);
      }
    }
    console.log(`💾 Berhasil mengupdate ${updatedTotal} SKU di Supabase PostgreSQL.`);
  }

  // 4. Backfill percontohan 1 foto untuk artikel yang salah satu warnanya punya foto
  console.log(`\n🔄 [Tahap 3] Mengisi percontohan 1 foto dari artikel yang sama untuk warna yang belum difoto...`);
  try {
    const backfilled = await prisma.$executeRawUnsafe(`
      UPDATE "Product" AS target
      SET "imageUrl" = sub.sample_img,
          "images" = ARRAY[sub.sample_img]::text[],
          "updatedAt" = NOW()
      FROM (
        SELECT DISTINCT ON (article) article, "imageUrl" AS sample_img
        FROM "Product"
        WHERE "imageUrl" IS NOT NULL AND article IS NOT NULL
        ORDER BY article, sku
      ) AS sub
      WHERE target.article = sub.article 
        AND target."imageUrl" IS NULL;
    `);
    console.log(`✅ [Tahap 3 Selesai] Berhasil mengisi percontohan 1 foto untuk ${backfilled} SKU tersisa.`);
  } catch (err) {
    console.error("Backfill error:", err.message);
  }

  // 5. Statistik Akhir
  const pqSkus = pqRecords.map(r => r.sku);
  const finalWithImg = await prisma.product.count({
    where: { sku: { in: pqSkus }, imageUrl: { not: null } }
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=================== REKAP FINAL STATUS SKU PQ ===================`);
  console.log(`⏱️ Selesai dalam ${duration} detik.`);
  console.log(`📊 Total SKU PQ: ${pqRecords.length}`);
  console.log(`✅ Total SKU PQ yang SUDAH memiliki foto: ${finalWithImg} / ${pqRecords.length} (${((finalWithImg / pqRecords.length) * 100).toFixed(1)}%)`);
  console.log(`⚠️ Total SKU PQ yang belum ada foto di Matahari: ${pqRecords.length - finalWithImg}`);
  console.log(`==================================================================`);
}

main().finally(() => prisma.$disconnect());

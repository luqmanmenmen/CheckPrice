const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper untuk fetch HEAD dengan timeout cepat (2000ms)
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

// Helper untuk memeriksa keberadaan foto asli di CDN Matahari
async function probeCdnPhotos(skus) {
  for (const sku of skus) {
    if (!sku || sku.length < 6) continue;
    const testUrl = `https://cdn.shopify.com/s/files/1/0666/9212/0727/files/${sku}-1.jpg`;
    const exists = await checkUrl(testUrl);
    if (exists) {
      // Sudut 1 ada! Cek sudut 2 sampai 6 secara paralel
      const angleChecks = await Promise.all([2, 3, 4, 5, 6].map(async (angle) => {
        const u = `https://cdn.shopify.com/s/files/1/0666/9212/0727/files/${sku}-${angle}.jpg`;
        const ok = await checkUrl(u);
        return ok ? u : null;
      }));
      const gallery = [testUrl, ...angleChecks.filter(Boolean)];
      return gallery;
    }
  }
  return [];
}

async function fullSync() {
  console.log("🚀 [Sync] Memulai penarikan 100% lengkap seluruh katalog SUKO dari Matahari...");
  const startTime = Date.now();

  const collections = [
    'suko',
    'hp-brand-suko',
    'new-year-new-style-all-suko-mulai-dari-79rb',
    'promo-tengah-bulan-best-of-suko',
    '4-4-urban-look-suko-kids-diskon-sampai-50',
    '4-4-urban-look-suko-women-pilihan-terbaik-mulai-dari-79rb'
  ];

  const productMap = new Map();

  for (const col of collections) {
    let p = 1;
    while (true) {
      try {
        const res = await fetch(`https://matahari.com/collections/${col}/products.json?limit=250&page=${p}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (!res.ok) break;
        const d = await res.json();
        if (!d.products || d.products.length === 0) break;
        for (const prod of d.products) {
          if (!productMap.has(prod.handle)) {
            productMap.set(prod.handle, prod);
          }
        }
        p++;
      } catch (err) {
        console.error(`Error fetching ${col} page ${p}:`, err.message);
        break;
      }
    }
  }

  console.log(`📦 [Sync] Berhasil menghimpun ${productMap.size} artikel produk unik SUKO.`);

  // 1. Petakan gambar dari p.images
  const productColorGalleries = new Map(); // handle -> { color -> images[] }
  const needsProbe = []; // { handle, color, skus }

  for (const p of productMap.values()) {
    const colorVariants = {};
    p.variants.forEach(v => {
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();
      if (!colorVariants[color]) colorVariants[color] = [];
      if (v.sku) colorVariants[color].push(v.sku.trim());
    });

    const galleries = {};
    for (const color of Object.keys(colorVariants)) {
      galleries[color] = [];
    }

    p.images.forEach(img => {
      const cleanSrc = img.src.startsWith('//') ? `https:${img.src}` : img.src;
      const filename = cleanSrc.split('?')[0].split('/').pop();
      const match = filename.match(/(\d{6,12})/);
      if (match) {
        const code = match[1];
        for (const [color, skus] of Object.entries(colorVariants)) {
          if (skus.includes(code)) {
            if (!galleries[color].includes(cleanSrc)) {
              galleries[color].push(cleanSrc);
            }
            break;
          }
        }
      }
    });

    for (const [color, skus] of Object.entries(colorVariants)) {
      if (galleries[color].length === 0) {
        needsProbe.push({ handle: p.handle, color, skus });
      }
    }

    productColorGalleries.set(p.handle, { colorVariants, galleries });
  }

  console.log(`🔍 [Probe CDN] Terdeteksi ${needsProbe.length} warna belum punya foto di JSON. Mulai probing paralel ke CDN...`);

  // Probing CDN secara concurrent (batch 20)
  const probeBatchSize = 20;
  let probedFound = 0;

  for (let i = 0; i < needsProbe.length; i += probeBatchSize) {
    const batch = needsProbe.slice(i, i + probeBatchSize);
    await Promise.all(batch.map(async (item) => {
      const photos = await probeCdnPhotos(item.skus);
      if (photos.length > 0) {
        const pEntry = productColorGalleries.get(item.handle);
        if (pEntry) {
          pEntry.galleries[item.color] = photos;
          probedFound++;
        }
      }
    }));
    process.stdout.write(`⏳ Probing CDN: ${Math.min(i + probeBatchSize, needsProbe.length)}/${needsProbe.length} (${probedFound} foto warna ditemukan)...\r`);
  }

  console.log(`\n✨ [Probe CDN] Selesai probing! Berhasil menemukan ${probedFound} galeri foto warna asli dari CDN.`);

  // 2. Bangun skuImageRecords
  const skuImageRecords = [];

  for (const [handle, { colorVariants, galleries }] of productColorGalleries.entries()) {
    const p = productMap.get(handle);

    // Kumpulkan percontohan 1 foto dari artikel ini untuk warna yang belum difoto oleh Matahari
    let sampleArticlePhoto = null;
    for (const gal of Object.values(galleries)) {
      if (gal && gal.length > 0) {
        sampleArticlePhoto = gal[0];
        break;
      }
    }
    if (!sampleArticlePhoto && p.images && p.images.length > 0) {
      sampleArticlePhoto = p.images[0].src.startsWith('//') ? `https:${p.images[0].src}` : p.images[0].src;
    }

    for (const v of p.variants) {
      if (!v.sku) continue;
      const sku = v.sku.trim();
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();

      let gallery = galleries[color] || [];

      // Sortir sudut -1, -2, -3...
      gallery = [...gallery].sort((a, b) => {
        const getAngle = (url) => {
          const fn = url.split('?')[0].split('/').pop();
          const m = fn.match(/-(\d+)[._]/);
          return m ? parseInt(m[1], 10) : 99;
        };
        return getAngle(a) - getAngle(b);
      });

      // Filter deduplikasi sudut
      const seenAngles = new Set();
      const distinctGallery = [];
      for (const u of gallery) {
        const fn = u.split('?')[0].split('/').pop();
        const m = fn.match(/-(\d+)[._]/);
        const angleKey = m ? m[1] : u;
        if (!seenAngles.has(angleKey)) {
          seenAngles.add(angleKey);
          distinctGallery.push(u);
        }
      }

      const finalGallery = distinctGallery.length > 0 ? distinctGallery : gallery;
      const hasOwnPhotos = finalGallery.length > 0;

      // Jika warna ini punya foto sendiri: tampilkan SELURUH sudut fotonya!
      // Jika warna ini belum ada foto di Matahari: beri 1 foto percontohan dari artikel agar tidak kosong!
      const primaryImg = hasOwnPhotos ? finalGallery[0] : sampleArticlePhoto;
      const finalImages = hasOwnPhotos ? finalGallery : (sampleArticlePhoto ? [sampleArticlePhoto] : []);

      skuImageRecords.push({
        sku,
        imageUrl: primaryImg,
        images: finalImages
      });
    }
  }

  console.log(`🖼️ [Sync] Siap memperbarui ${skuImageRecords.length} SKU di PostgreSQL Supabase.`);

  // Update Supabase PostgreSQL dalam batch 200
  const chunkSize = 200;
  let totalUpdated = 0;

  for (let i = 0; i < skuImageRecords.length; i += chunkSize) {
    const chunk = skuImageRecords.slice(i, i + chunkSize);

    const valuesList = chunk.map(c => {
      const safeSku = c.sku.replace(/'/g, "''");
      const safePrimary = c.imageUrl ? `'${c.imageUrl.replace(/'/g, "''")}'` : 'NULL';
      const arraySql = c.images && c.images.length > 0
        ? `ARRAY[${c.images.map(img => `'${img.replace(/'/g, "''")}'`).join(', ')}]::text[]`
        : `'{}'::text[]`;
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
      totalUpdated += affected;
      process.stdout.write(`⏳ Progres DB: ${totalUpdated} SKU terupdate (${Math.min(i + chunkSize, skuImageRecords.length)}/${skuImageRecords.length})...\r`);
    } catch (err) {
      console.error(`\n❌ Error pada chunk ${i}:`, err.message);
    }
  }

  // Backfill SKU tersisa yang artikelnya punya foto tetapi SKU warna tersebut masih kosong
  console.log(`\n🔄 [Backfill] Mengisi sisa SKU yang kosong dengan 1 foto percontohan dari artikel yang sama...`);
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
    console.log(`✅ [Backfill] Berhasil mengisi percontohan 1 foto untuk ${backfilled} SKU tersisa.`);
  } catch (err) {
    console.error("Backfill error:", err.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ [Sync] SELESAI dalam ${duration} detik! Berhasil memperbarui ${totalUpdated} SKU di PostgreSQL Supabase.`);

  // Verifikasi khusus SKU 21816555 (CHARCOAL) & 61358270 (VANILLA)
  const v1 = await prisma.product.findUnique({ where: { sku: '21816555' } });
  console.log('\n🔍 Verifikasi SKU 21816555 (CHARCOAL):', {
    sku: v1?.sku,
    color: v1?.color,
    imageUrl: v1?.imageUrl,
    imagesCount: v1?.images?.length,
    images: v1?.images
  });

  const v2 = await prisma.product.findUnique({ where: { sku: '61358270' } });
  console.log('\n🔍 Verifikasi SKU 61358270 (VANILLA):', {
    sku: v2?.sku,
    color: v2?.color,
    imageUrl: v2?.imageUrl,
    imagesCount: v2?.images?.length,
    images: v2?.images
  });

  await prisma.$disconnect();
}

fullSync().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});

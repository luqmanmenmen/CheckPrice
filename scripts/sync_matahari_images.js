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
  console.log("🚀 [Sync] Memulai sinkronisasi katalog & foto Matahari (Konsep Collage & Audit)...");
  const startTime = Date.now();

  // 1. Ambil status produk yang sudah ada di Supabase untuk menghemat kuota
  console.log("🔍 [Collage] Mengambil inventori foto yang sudah tersimpan di database Supabase...");
  const dbProducts = await prisma.product.findMany({
    select: {
      sku: true,
      imageUrl: true,
      images: true,
    }
  });

  const existingSkuMap = new Map();
  for (const p of dbProducts) {
    const hasPhotos = Boolean(p.imageUrl && p.images && p.images.length > 0);
    existingSkuMap.set(p.sku, hasPhotos);
  }
  const alreadyHavePhotosCount = Array.from(existingSkuMap.values()).filter(Boolean).length;
  console.log(`📦 [DB Status] Ditemukan ${dbProducts.length} produk di database (${alreadyHavePhotosCount} sudah berfoto lengkap).`);

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
        await new Promise((r) => setTimeout(r, 250));
      } catch (err) {
        console.error(`Error fetching ${col} page ${p}:`, err.message);
        break;
      }
    }
  }

  console.log(`📦 [Collage] Berhasil menghimpun ${productMap.size} artikel produk dari katalog online Matahari.`);

  // 2. Petakan gambar dari p.images & filter SKU yang belum punya foto saja (Collage)
  const productColorGalleries = new Map(); // handle -> { colorVariants, galleries }
  const needsProbe = []; // { handle, color, skus }
  let skippedAlreadyHaveCount = 0;

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
      // PRINSIP COLLAGE: Jika seluruh SKU di warna ini sudah punya foto di Supabase, lewati!
      const allSkusHavePhotos = skus.length > 0 && skus.every(sku => existingSkuMap.get(sku) === true);
      if (allSkusHavePhotos) {
        skippedAlreadyHaveCount += skus.length;
        continue;
      }

      if (galleries[color].length === 0) {
        needsProbe.push({ handle: p.handle, color, skus });
      }
    }

    productColorGalleries.set(p.handle, { colorVariants, galleries });
  }

  console.log(`⚡ [Prinsip Collage] Melewati ${skippedAlreadyHaveCount} SKU yang sudah berfoto lengkap.`);
  console.log(`🔍 [Probe CDN] Terdeteksi ${needsProbe.length} warna belum punya foto. Mulai probing paralel ke CDN...`);

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

  // 2. Bangun skuImageRecords & Kumpulkan Produk Baru (Collage)
  const skuImageRecords = [];
  const newProductsToCreate = [];

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
      const size = (v.title.split('/')[1] || '').trim().toUpperCase();

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

      // Foto utama & galeri
      const primaryImg = hasOwnPhotos ? finalGallery[0] : sampleArticlePhoto;
      const finalImages = hasOwnPhotos ? finalGallery : (sampleArticlePhoto ? [sampleArticlePhoto] : []);

      // PRINSIP COLLAGE:
      // A. Jika SKU ini belum ada di Supabase -> Kumpulkan sebagai PRODUK BARU!
      if (!existingSkuMap.has(sku)) {
        newProductsToCreate.push({
          sku,
          article: p.handle,
          description: p.title || `SUKO ITEM ${sku}`,
          brand: 'SUKO',
          dept: 'SUKO ESSENTIALS',
          color: color || null,
          size: size || null,
          hargaNormal: Math.round(parseFloat(v.price) || 0),
          stok: 0,
          imageUrl: primaryImg || null,
          images: finalImages || [],
          updatedAt: new Date(),
        });
        existingSkuMap.set(sku, Boolean(primaryImg));
      } 
      // B. Jika SKU sudah ada di Supabase tetapi fotonya belum ada -> Lengkapi fotonya!
      else if (existingSkuMap.get(sku) === false && primaryImg) {
        skuImageRecords.push({
          sku,
          imageUrl: primaryImg,
          images: finalImages
        });
      }
      // C. Jika SKU sudah ada dan fotonya sudah lengkap -> LEWATI (Hemat Kuota & Kecepatan 0ms)!
    }
  }

  // Simpan Produk Baru (Collage Produk Baru)
  if (newProductsToCreate.length > 0) {
    console.log(`✨ [Collage Produk Baru] Ditemukan ${newProductsToCreate.length} SKU baru dari katalog Matahari! Menyimpan ke database...`);
    try {
      const createRes = await prisma.product.createMany({
        data: newProductsToCreate,
        skipDuplicates: true,
      });
      console.log(`✅ [Collage Produk Baru] Berhasil mendaftarkan ${createRes.count} produk baru.`);
    } catch (createErr) {
      console.warn("⚠️ Gagal createMany produk baru:", createErr.message);
    }
  } else {
    console.log("👌 [Collage Produk Baru] Tidak ada SKU baru dari katalog online. Database sudah up-to-date.");
  }

  console.log(`🖼️ [Collage Foto] Siap memperbarui ${skuImageRecords.length} SKU yang belum berfoto di PostgreSQL Supabase.`);

  // Update Supabase PostgreSQL dalam batch 200 jika ada SKU yang butuh foto
  const chunkSize = 200;
  let totalUpdated = 0;

  if (skuImageRecords.length > 0) {
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
  } else {
    console.log("⚡ [Collage Foto] Tidak ada SKU yang kekurangan foto. Probing CDN diabaikan.");
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

    // Backfill kategori esensial yang masih belum ada fotonya sama sekali di artikelnya
    const socksImg = 'https://cdn.shopify.com/s/files/1/0666/9212/0727/files/48265305-IMG1.jpg';
    const boxerImg = 'https://cdn.shopify.com/s/files/1/0666/9212/0727/files/53805668-1.jpg';
    const nayoungImg = 'https://cdn.shopify.com/s/files/1/0666/9212/0727/files/71408365-1.jpg';

    const socksBackfilled = await prisma.$executeRawUnsafe(`
      UPDATE "Product"
      SET "imageUrl" = '${socksImg}',
          "images" = ARRAY['${socksImg}']::text[],
          "updatedAt" = NOW()
      WHERE "imageUrl" IS NULL 
        AND ("description" ILIKE '%KAOS KAKI%' OR "description" ILIKE '%SOCKS%');
    `);
    console.log(`🧦 [Backfill Kaos Kaki] Mengisi foto resmi untuk ${socksBackfilled} SKU kaos kaki.`);

    const boxerBackfilled = await prisma.$executeRawUnsafe(`
      UPDATE "Product"
      SET "imageUrl" = '${boxerImg}',
          "images" = ARRAY['${boxerImg}']::text[],
          "updatedAt" = NOW()
      WHERE "imageUrl" IS NULL 
        AND ("description" ILIKE '%BOXER%' OR "description" ILIKE '%UNDERWEAR%');
    `);
    console.log(`🩲 [Backfill Underwear] Mengisi foto resmi untuk ${boxerBackfilled} SKU boxer/underwear.`);

    const nayoungBackfilled = await prisma.$executeRawUnsafe(`
      UPDATE "Product"
      SET "imageUrl" = '${nayoungImg}',
          "images" = ARRAY['${nayoungImg}']::text[],
          "updatedAt" = NOW()
      WHERE "imageUrl" IS NULL 
        AND ("dept" = 'NAYOUNG' OR "brand" ILIKE '%NAYOUNG%' OR "description" ILIKE '%NAYOUNG%');
    `);
    console.log(`💄 [Backfill Nayoung] Mengisi foto resmi untuk ${nayoungBackfilled} SKU kosmetik Nayoung.`);

  } catch (err) {
    console.error("Backfill error:", err.message);
  }

  // Catat log ke tabel SyncHistory
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { nik: '22054178' },
          { nik: '223515' },
          { role: 'SUPERVISOR' },
        ]
      }
    }) || await prisma.user.findFirst();
    if (user) {
      const totalProcessed = totalUpdated + (newProductsToCreate ? newProductsToCreate.length : 0);
      await prisma.syncHistory.create({
        data: {
          userId: user.id,
          type: 'PHOTO_SYNC',
          fileName: 'Matahari Shopify CDN Photos',
          status: 'SUCCESS',
          records: totalProcessed
        }
      });
      console.log(`📝 Log sinkronisasi tersimpan di tabel SyncHistory (${totalProcessed} produk).`);
    }
  } catch (logErr) {
    console.warn("⚠️ Gagal mencatat SyncHistory:", logErr.message);
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

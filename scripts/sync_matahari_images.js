const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

  const skuImageRecords = [];

  for (const p of productMap.values()) {
    // 1. Petakan varian ke kelompok warna
    const colorVariants = {}; // COLOR -> [skus]
    p.variants.forEach(v => {
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();
      if (!colorVariants[color]) colorVariants[color] = [];
      if (v.sku) colorVariants[color].push(v.sku.trim());
    });

    // 2. Petakan foto ke warna berdasarkan kode photoshoot pada nama file foto
    // Contoh: "61358252-1.jpg" -> kode "61358252", cari warna mana yang memiliki SKU ini.
    const colorGalleries = {};
    for (const color of Object.keys(colorVariants)) {
      colorGalleries[color] = [];
    }

    p.images.forEach(img => {
      const cleanSrc = img.src.startsWith('//') ? `https:${img.src}` : img.src;
      const filename = cleanSrc.split('?')[0].split('/').pop();

      // Cari digit SKU 6-12 digit di nama file
      const match = filename.match(/(\d{6,12})/);
      if (match) {
        const code = match[1];
        for (const [color, skus] of Object.entries(colorVariants)) {
          if (skus.includes(code)) {
            if (!colorGalleries[color].includes(cleanSrc)) {
              colorGalleries[color].push(cleanSrc);
            }
            break;
          }
        }
      }
    });

    // Fallback: Jika ada warna yang tidak punya kode di filename, cek apakah ada featured_image dari varian
    p.variants.forEach(v => {
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();
      if (colorGalleries[color] && colorGalleries[color].length === 0 && v.featured_image?.src) {
        const clean = v.featured_image.src.startsWith('//') ? `https:${v.featured_image.src}` : v.featured_image.src;
        if (!colorGalleries[color].includes(clean)) {
          colorGalleries[color].push(clean);
        }
      }
    });

    // 3. Bangun data per varian SKU
    for (const v of p.variants) {
      if (!v.sku) continue;
      const sku = v.sku.trim();
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();

      let gallery = colorGalleries[color] || [];

      // Sortir agar sudut -1, -2, -3, -4, -5 berurutan rapi
      gallery = [...gallery].sort((a, b) => {
        const getAngle = (url) => {
          const fn = url.split('?')[0].split('/').pop();
          const m = fn.match(/-(\d+)[._]/);
          return m ? parseInt(m[1], 10) : 99;
        };
        return getAngle(a) - getAngle(b);
      });

      // Filter agar tiap sudut (1, 2, 3...) hanya muncul 1x (tidak duplikat)
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
      const primaryImg = finalGallery.length > 0 ? finalGallery[0] : null;

      if (primaryImg && finalGallery.length > 0) {
        skuImageRecords.push({
          sku,
          imageUrl: primaryImg,
          images: finalGallery
        });
      }
    }
  }

  console.log(`🖼️ [Sync] Siap memperbarui ${skuImageRecords.length} SKU varian dengan galeri foto akurat per warna.`);

  // Update Supabase PostgreSQL dalam batch
  const chunkSize = 200;
  let totalUpdated = 0;

  for (let i = 0; i < skuImageRecords.length; i += chunkSize) {
    const chunk = skuImageRecords.slice(i, i + chunkSize);

    const valuesList = chunk.map(c => {
      const safeSku = c.sku.replace(/'/g, "''");
      const safePrimary = c.imageUrl.replace(/'/g, "''");
      const arraySql = `ARRAY[${c.images.map(img => `'${img.replace(/'/g, "''")}'`).join(', ')}]::text[]`;
      return `('${safeSku}', '${safePrimary}', ${arraySql})`;
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

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ [Sync] SELESAI dalam ${duration} detik! Berhasil memperbarui ${totalUpdated} SKU di PostgreSQL Supabase.`);

  // Verifikasi khusus SKU 61358270
  const verify = await prisma.product.findUnique({ where: { sku: '61358270' } });
  console.log('\n🔍 Verifikasi SKU 61358270:', {
    sku: verify?.sku,
    color: verify?.color,
    imageUrl: verify?.imageUrl,
    imagesCount: verify?.images?.length,
    images: verify?.images
  });

  await prisma.$disconnect();
}

fullSync().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});

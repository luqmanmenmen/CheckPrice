const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncImages() {
  console.log("🚀 [Sync Images] Memulai penarikan galeri foto akurat per SKU & Warna dari Matahari.com...");
  const startTime = Date.now();

  const res = await fetch("https://matahari.com/collections/hp-brand-suko/products.json?limit=250", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  if (!res.ok) {
    throw new Error(`Gagal fetch dari Matahari.com: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const products = data.products || [];
  console.log(`📦 [Sync Images] Ditemukan ${products.length} artikel produk di Matahari.`);

  const skuImageRecords = [];

  for (const p of products) {
    const defaultImg = p.images && p.images.length > 0
      ? (p.images[0].src.startsWith('//') ? `https:${p.images[0].src}` : p.images[0].src)
      : null;

    // 1. Kelompokkan varian per warna & kumpulkan kode photoshoot spesifik warna tersebut
    const colorMap = {};
    p.variants.forEach(v => {
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();
      if (!colorMap[color]) {
        colorMap[color] = {
          color,
          codes: new Set(),
          featuredImage: null,
          images: []
        };
      }
      if (v.sku) colorMap[color].codes.add(v.sku.trim());
      if (v.featured_image && v.featured_image.src) {
        const clean = v.featured_image.src.startsWith('//') ? `https:${v.featured_image.src}` : v.featured_image.src;
        if (!colorMap[color].featuredImage) colorMap[color].featuredImage = clean;
        const filename = clean.split('?')[0].split('/').pop();
        const matches = filename.match(/\d{6,12}/g);
        if (matches) matches.forEach(m => colorMap[color].codes.add(m));
      }
    });

    // 2. Cocokkan foto hanya ke warna yang sesuai (TANPA bocor ke warna lain)
    p.images.forEach(img => {
      const cleanSrc = img.src.startsWith('//') ? `https:${img.src}` : img.src;
      const filename = cleanSrc.split('?')[0].split('/').pop();

      for (const [color, data] of Object.entries(colorMap)) {
        const byVariantId = img.variant_ids && img.variant_ids.some(vid =>
          p.variants.some(v => v.id === vid && (v.title.split('/')[0] || '').trim().toUpperCase() === color)
        );
        const byCode = Array.from(data.codes).some(code => filename.includes(code));

        if (byVariantId || byCode) {
          if (!data.images.includes(cleanSrc)) {
            data.images.push(cleanSrc);
          }
        }
      }
    });

    // 3. Bangun galeri per variant SKU
    for (const v of p.variants) {
      if (!v.sku) continue;
      const sku = v.sku.trim();
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();

      let primaryImg = v.featured_image
        ? (v.featured_image.src.startsWith('//') ? `https:${v.featured_image.src}` : v.featured_image.src)
        : colorMap[color]?.featuredImage;

      let gallery = colorMap[color]?.images ? [...colorMap[color].images] : [];

      // Pastikan primaryImg berada di index 0
      if (primaryImg) {
        gallery = [primaryImg, ...gallery.filter(u => u !== primaryImg)];
      } else if (gallery.length > 0) {
        primaryImg = gallery[0];
      } else if (defaultImg) {
        primaryImg = defaultImg;
        gallery = [defaultImg];
      }

      if (primaryImg && gallery.length > 0) {
        skuImageRecords.push({
          sku,
          imageUrl: primaryImg,
          images: gallery
        });
      }
    }
  }

  console.log(`🖼️ [Sync Images] Siap mengupdate ${skuImageRecords.length} SKU dengan galeri foto akurat per warna.`);

  // Update ke PostgreSQL Supabase dalam chunk 200 row
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
      process.stdout.write(`⏳ Progres: ${totalUpdated} SKU terupdate (${Math.min(i + chunkSize, skuImageRecords.length)}/${skuImageRecords.length})...\r`);
    } catch (err) {
      console.error(`\n❌ Error pada chunk ${i}:`, err.message);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ [Sync Images] SELESAI dalam ${duration} detik! Berhasil memperbarui ${totalUpdated} SKU dengan galeri foto akurat per warna.`);

  await prisma.$disconnect();
}

syncImages().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});

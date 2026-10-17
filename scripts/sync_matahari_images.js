const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncImages() {
  console.log("🚀 [Sync Images] Memulai penarikan galeri multi-foto resmi SUKO dari Matahari.com...");
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
    const productImages = (p.images || []).map(img => {
      const src = img.src.startsWith('//') ? `https:${img.src}` : img.src;
      return { id: img.id, src, variant_ids: img.variant_ids || [] };
    });

    const defaultImg = productImages.length > 0 ? productImages[0].src : null;

    // Kelompokkan SKU berdasarkan warna
    const variantSkusByColor = {};
    p.variants.forEach(v => {
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();
      if (!variantSkusByColor[color]) variantSkusByColor[color] = [];
      if (v.sku) variantSkusByColor[color].push(v.sku.trim());
    });

    // Petakan gambar per warna
    const colorImagesMap = {};
    for (const color of Object.keys(variantSkusByColor)) {
      colorImagesMap[color] = new Set();
    }

    // Masukkan featured_image masing-masing varian terlebih dahulu (prioritas utama)
    p.variants.forEach(v => {
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();
      if (v.featured_image && v.featured_image.src) {
        const clean = v.featured_image.src.startsWith('//') ? `https:${v.featured_image.src}` : v.featured_image.src;
        if (colorImagesMap[color]) colorImagesMap[color].add(clean);
      }
    });

    // Cocokkan seluruh gambar produk ke warna yang relevan
    productImages.forEach(img => {
      let matchedAny = false;
      for (const [color, skus] of Object.entries(variantSkusByColor)) {
        const matchesSku = skus.some(s => img.src.includes(s));
        const matchesVariantId = img.variant_ids.some(vid => p.variants.some(v => v.id === vid && (v.title.split('/')[0] || '').trim().toUpperCase() === color));
        if (matchesSku || matchesVariantId) {
          colorImagesMap[color].add(img.src);
          matchedAny = true;
        }
      }

      // Gambar umum (lifestyle/tampak belakang tanpa spesifik varian ID) ditambahkan ke semua warna
      if (!matchedAny && img.variant_ids.length === 0) {
        for (const color of Object.keys(colorImagesMap)) {
          colorImagesMap[color].add(img.src);
        }
      }
    });

    // Sekarang buat record per variant SKU
    for (const v of p.variants) {
      if (!v.sku) continue;
      const sku = v.sku.trim();
      const color = (v.title.split('/')[0] || '').trim().toUpperCase();

      // Featured image spesifik varian
      let primaryImg = v.featured_image ? v.featured_image.src : null;
      if (primaryImg && primaryImg.startsWith('//')) primaryImg = `https:${primaryImg}`;

      // Daftar galeri gambar warna ini
      let gallery = Array.from(colorImagesMap[color] || []);

      // Pastikan primaryImg berada di urutan pertama (index 0)
      if (primaryImg) {
        gallery = [primaryImg, ...gallery.filter(u => u !== primaryImg)];
      } else if (gallery.length > 0) {
        primaryImg = gallery[0];
      } else if (defaultImg) {
        primaryImg = defaultImg;
        gallery = [defaultImg];
      }

      // Fallback jika masih kosong: gunakan semua gambar produk
      if (gallery.length === 0 && productImages.length > 0) {
        gallery = productImages.map(i => i.src);
        primaryImg = gallery[0];
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

  console.log(`🖼️ [Sync Images] Siap mengupdate ${skuImageRecords.length} SKU dengan galeri foto slide.`);

  // Update ke database dalam chunks 200 row
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
  console.log(`\n✅ [Sync Images] SELESAI dalam ${duration} detik! Berhasil mengupdate ${totalUpdated} SKU dengan galeri multi-foto slide.`);

  await prisma.$disconnect();
}

syncImages().catch(err => {
  console.error("Fatal error:", err);
  prisma.$disconnect();
  process.exit(1);
});

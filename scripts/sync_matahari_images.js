const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncImages() {
  console.log("🚀 [Sync Images] Memulai penarikan foto resmi SUKO dari Matahari.com...");
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
  console.log(`📦 [Sync Images] Ditemukan ${products.length} artikel induk di Matahari.`);

  const skuImagePairs = [];

  for (const p of products) {
    const defaultImg = p.images && p.images.length > 0 ? p.images[0].src : null;

    for (const v of p.variants) {
      if (v.sku) {
        const img = v.featured_image ? v.featured_image.src : defaultImg;
        if (img) {
          const cleanImg = img.startsWith('//') ? `https:${img}` : img;
          skuImagePairs.push({
            sku: v.sku.trim(),
            imageUrl: cleanImg
          });
        }
      }
    }
  }

  console.log(`🖼️ [Sync Images] Mengumpulkan ${skuImagePairs.length} foto spesifik SKU.`);

  // Update menggunakan PostgreSQL UPDATE ... FROM VALUES (Super Cepat & 1 Koneksi!)
  const chunkSize = 250;
  let totalUpdated = 0;

  for (let i = 0; i < skuImagePairs.length; i += chunkSize) {
    const chunk = skuImagePairs.slice(i, i + chunkSize);

    const valuesList = chunk.map(c => {
      const safeSku = c.sku.replace(/'/g, "''");
      const safeUrl = c.imageUrl.replace(/'/g, "''");
      return `('${safeSku}', '${safeUrl}')`;
    }).join(", ");

    const sql = `
      UPDATE "Product" AS p
      SET "imageUrl" = c.img,
          "updatedAt" = NOW()
      FROM (VALUES ${valuesList}) AS c(sku, img)
      WHERE p.sku = c.sku;
    `;

    const count = await prisma.$executeRawUnsafe(sql);
    totalUpdated += count;

    console.log(`⚡ [Sync Images] Chunk ${Math.floor(i / chunkSize) + 1} selesai: ${count} produk terupdate.`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 [Sync Images] BERHASIL! Total ${totalUpdated} SKU di database toko kita kini memiliki foto resmi Matahari (Waktu: ${duration} detik).`);
}

syncImages()
  .catch(err => {
    console.error("❌ [Sync Images] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

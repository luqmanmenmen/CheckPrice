const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MISMATCHED_BAG_ACC_SKUS = [
  // CROSS BODY BAG SKAA587 (Salah model: Connexion 69003647)
  '68155753', '68155762', '68155771', '68155744',
  // BACKPACK SKAA581 (Salah model: Ransel 62927153)
  '68155628', '68155646', '68155637',
  // SHOULDER BAG SKAA588 (Salah model: Shoulder 62944054)
  '68155691', '68155655', '68155664', '68155682', '68155673',
  // KEYCHAIN 24MT207 (Salah model: 52117421)
  '55261055',
  // KACAMATA HITAM (Salah model kacamata: 28055230)
  '52766211', '52755072', '52768880', '52768899', '52768933', '52768906', '52768924',
  // HAIR ACCESSORIES (Salah model: 55620283, 63028748)
  '55433226', '55433155'
];

async function main() {
  console.log(`Membersihkan ${MISMATCHED_BAG_ACC_SKUS.length} SKU tas & aksesoris yang salah model foto...`);
  
  const res = await prisma.product.updateMany({
    where: {
      sku: { in: MISMATCHED_BAG_ACC_SKUS }
    },
    data: {
      imageUrl: null,
      images: []
    }
  });

  console.log(`✅ Berhasil membersihkan ${res.count} produk dari foto model yang salah.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const minusProducts = await prisma.product.findMany({
    where: { stok: { lt: 0 } },
    select: { article: true, sku: true, stok: true }
  });
  
  const minusArticles = minusProducts.map(p => p.article).filter(Boolean);
  
  // Find plus products with the same articles
  const plusProducts = await prisma.product.findMany({
    where: { 
      stok: { gt: 0 },
      article: { in: minusArticles }
    },
    select: { article: true, sku: true, stok: true }
  });
  
  console.log("Minus count:", minusProducts.length);
  console.log("Plus count:", plusProducts.length);
  
  // group them
  const grouped = {};
  for(const p of minusProducts) {
    if(!p.article) continue;
    if(!grouped[p.article]) grouped[p.article] = { minus: [], plus: [] };
    grouped[p.article].minus.push(p);
  }
  for(const p of plusProducts) {
    if(!p.article) continue;
    if(grouped[p.article]) {
       grouped[p.article].plus.push(p);
    }
  }
  
  const actualPairs = Object.keys(grouped).filter(k => grouped[k].plus.length > 0 && grouped[k].minus.length > 0);
  console.log("Found pairs:", actualPairs.length);
  if (actualPairs.length > 0) {
    console.log(grouped[actualPairs[0]]);
  }
}

run();

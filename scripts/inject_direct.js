const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PQ_FILE = 'D:\\Website\\SUKO\\PQ\\POWER QUERY 28 SEPTEMBER 2026.csv';
const PROMO_DIR = 'D:\\Website\\SUKO\\Update Promo\\24 31 september';

const COL_ALIASES = {
  "SKU": ["SKU","KODE","KODE PRODUK","PRODUCT CODE","CODE","ID"],
  "DESCRIPTION": ["DESCRIPTION","ITEM_DESCRIPTION","ITEM DESCRIPTION","NAMA","NAMA PRODUK","ITEM_DESCRIP"],
  "HARGA NORMAL": ["HARGA NORMAL","HARGA","NORMAL PRICE","PRICE","HARGA JUAL","REGULAR PRICE"],
  "HARGA PROMO": ["HARGA PROMO","PROMO PRICE","PROMO","HARGA DISKON"],
  "ARTICLE": ["ARTICLE","ARTIKEL","BARCODE","PARENT_NAME","PARENT NAME"],
  "FROM DATE": ["FROM DATE","DARI TANGGAL","START DATE","FROM"],
  "TO DATE": ["TO DATE","SAMPAI TANGGAL","END DATE","TO","BERLAKU SAMPAI"],
  "DISKON": ["DISKON","DISCOUNT","DISC"],
  "DISCOUNT TYPE": ["DISCOUNT TYPE","TIPE DISKON"],
  "BRAND": ["BRAND","MEREK","GROUP"],
  "DEPT": ["DEPT","DEPARTMENT","KATEGORI","CATEGORY"],
  "ACARA": ["ACARA","EVENT","PROMO NAME"],
  "STOK": ["STOK","EOH_UNIT","EOH UNIT","EOH","QTY"],
  "SALES_MTD": ["SALES_MTD","MTD_SALES_UNIT","MTD SALES UNIT","SALES MTD","MTD"],
  "MTD_SALES_RETAIL": ["MTD_SALES_RETAIL","MTD SALES RETAIL"],
  "YTD_SALES_UNIT": ["YTD_SALES_UNIT","YTD SALES UNIT","SUM OF YTD_SALES_UNIT"],
  "YTD_SALES_RETAIL": ["YTD_SALES_RETAIL","YTD SALES RETAIL","SUM OF YTD_SALES_RETAIL"],
  "EOH_RETAIL": ["EOH_RETAIL","EOH RETAIL","SUM OF EOH_RETAIL"],
  "BOY_UNIT": ["BOY_UNIT","BOY UNIT","SUM OF BOY_UNIT"],
  "BOY_RETAIL": ["BOY_RETAIL","BOY RETAIL","SUM OF BOY_RETAIL"],
  "COLOR": ["COLOR","WARNA"],
  "SIZE": ["SIZE","UKURAN"],
  "DAY_SALES_UNIT": ["DAY SALES UNIT","DAY_SALES_UNIT"],
  "DAY_SALES_RETAIL": ["DAY SALES RETAIL","DAY_SALES_RETAIL"],
};

function safeFloat(val) {
  if (!val && val !== 0) return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g,''));
  return isNaN(n) ? 0 : n;
}

function normalizeKeys(row) {
  const out = {};
  for (const k of Object.keys(row)) out[k.trim().toUpperCase()] = row[k];
  return out;
}

function remapKeys(row) {
  const out = {...row};
  for (const [std, aliases] of Object.entries(COL_ALIASES)) {
    if (std in out) continue;
    for (const a of aliases) { if (a in out) { out[std] = out[a]; break; } }
  }
  return out;
}

function processFile(filePath, productMap) {
  const wb = xlsx.read(fs.readFileSync(filePath), {type:'buffer', cellDates:false});
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(ws, {header:1, defval:''});
    if (!rawData.length) continue;
    const skuAliases = ['SKU','KODE','KODE PRODUK','PRODUCT CODE','CODE','ID'];
    let headerRowIndex = 0;
    for (let i=0; i<Math.min(20,rawData.length); i++) {
      if (rawData[i].map(c=>String(c).trim().toUpperCase()).some(c=>skuAliases.includes(c))) {
        headerRowIndex=i; break;
      }
    }
    const headers = rawData[headerRowIndex].map(h=>String(h).trim());
    let added=0;
    for (let i=headerRowIndex+1; i<rawData.length; i++) {
      const rowArr=rawData[i];
      if (!rowArr.some(v=>v!==''&&v!==undefined)) continue;
      const rowObj={};
      for (let j=0;j<headers.length;j++) if(headers[j]) rowObj[headers[j]]=rowArr[j]!==undefined?rowArr[j]:'';
      const row=remapKeys(normalizeKeys(rowObj));
      const sku=String(row['SKU']??'').trim();
      if (!sku) continue;

      let hargaNormal=safeFloat(row['HARGA NORMAL']);
      if (hargaNormal===0) {
        const eU=safeFloat(row['STOK']),eR=safeFloat(row['EOH_RETAIL']);
        const yU=safeFloat(row['YTD_SALES_UNIT']),yR=safeFloat(row['YTD_SALES_RETAIL']);
        const bU=safeFloat(row['BOY_UNIT']),bR=safeFloat(row['BOY_RETAIL']);
        let base=0;
        if(eU>0) base=eR/eU; else if(yU>0) base=yR/yU; else if(bU>0) base=bR/bU;
        if(base>0) hargaNormal=Math.round(base);
      }

      let hargaPromo=null;
      if (row['HARGA PROMO']!==undefined) {
        const rp=row['HARGA PROMO'];
        const rs=typeof rp==='string'?rp.toUpperCase():'';
        const isText=rs.includes('NORMAL')||rs.match(/B\dG\d/)||rs==='';
        const v=isText?null:safeFloat(rp);
        hargaPromo=v&&v>0?v:null;
      }

      const item={
        sku,
        description: row['DESCRIPTION']!==undefined?String(row['DESCRIPTION']).trim()||'-':'-',
        article: row['ARTICLE']!==undefined?String(row['ARTICLE']).trim()||null:null,
        hargaNormal: hargaNormal||0,
        hargaPromo,
        diskon: row['DISKON']!==undefined?String(row['DISKON']).trim()||null:null,
        discountType: row['DISCOUNT TYPE']!==undefined?String(row['DISCOUNT TYPE']).trim()||null:null,
        acara: row['ACARA']!==undefined?String(row['ACARA']).trim()||null:null,
        fromDate: row['FROM DATE']!==undefined?String(row['FROM DATE']).trim()||null:null,
        toDate: row['TO DATE']!==undefined?String(row['TO DATE']).trim()||null:null,
        brand: row['BRAND']!==undefined?String(row['BRAND']).trim()||null:null,
        dept: row['DEPT']!==undefined?String(row['DEPT']).trim()||null:null,
        stok: row['STOK']!==undefined?parseInt(row['STOK'])||0:0,
        sales_mtd: row['SALES_MTD']!==undefined?parseInt(row['SALES_MTD'])||0:0,
        sales_mtd_retail: safeFloat(row['MTD_SALES_RETAIL']),
        sales_ytd: row['YTD_SALES_UNIT']!==undefined?parseInt(row['YTD_SALES_UNIT'])||0:0,
        sales_ytd_retail: safeFloat(row['YTD_SALES_RETAIL']),
        eoh_retail: safeFloat(row['EOH_RETAIL']),
        color: row['COLOR']!==undefined?String(row['COLOR']).trim()||null:null,
        size: row['SIZE']!==undefined?String(row['SIZE']).trim()||null:null,
        bom_unit: 0,
        day_sales_unit: row['DAY_SALES_UNIT']!==undefined?parseInt(row['DAY_SALES_UNIT'])||0:0,
        day_sales_retail: safeFloat(row['DAY_SALES_RETAIL']),
        lastPurchaseDate: null,
      };

      const existing=productMap.get(sku);
      if (!existing) { productMap.set(sku,item); added++; }
      else {
        const eP=existing.hargaPromo>0||existing.diskon;
        const nP=item.hargaPromo>0||item.diskon;
        if (!eP&&nP) productMap.set(sku,item);
        else if (nP) productMap.set(sku,{...existing,hargaPromo:item.hargaPromo,diskon:item.diskon,discountType:item.discountType,acara:item.acara,fromDate:item.fromDate,toDate:item.toDate});
      }
    }
    console.log(`  [${path.basename(filePath)}] "${sheetName}": ${added} baris`);
  }
}

async function main() {
  console.log('=== INJECT LANGSUNG KE SUPABASE ===\n');

  console.log('1. Membersihkan data lama...');
  await prisma.dailySales.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.syncHistory.deleteMany({});
  console.log('   Bersih.\n');

  console.log('2. Membaca PQ 28 September...');
  const productMap=new Map();
  processFile(PQ_FILE, productMap);
  console.log(`   SKU dari PQ: ${productMap.size}\n`);

  console.log('3. Membaca file Promo...');
  const promoFiles=fs.readdirSync(PROMO_DIR).filter(f=>f.endsWith('.xlsx')&&!f.startsWith('~'));
  for (const f of promoFiles) processFile(path.join(PROMO_DIR,f), productMap);
  console.log(`   SKU setelah merge Promo: ${productMap.size}\n`);

  console.log('4. Menyimpan ke database...');
  const allItems=Array.from(productMap.values());
  const CHUNK=500;
  let total=0;
  for (let i=0;i<allItems.length;i+=CHUNK) {
    const result=await prisma.product.createMany({data:allItems.slice(i,i+CHUNK),skipDuplicates:true});
    total+=result.count;
    process.stdout.write(`\r   Inserted: ${total}/${allItems.length}`);
  }
  console.log('\n');

  const finalCount=await prisma.product.count();
  const promoCount=await prisma.product.count({where:{hargaPromo:{not:null}}});
  console.log(`=== SELESAI! Produk: ${finalCount}, Dengan Promo: ${promoCount} ===`);
}

main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);}).finally(()=>prisma.$disconnect());

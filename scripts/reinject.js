const { PrismaClient } = require("@prisma/client");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const prisma = new PrismaClient();

const PQ_FILE = "D:\\Website\\SUKO\\PQ\\POWER QUERY 28 SEPTEMBER 2026.csv";
const PROMO_DIR = "D:\\Website\\SUKO\\Update Promo\\24 31 september";

function safeFloat(val) {
  if (!val && val!==0) return 0;
  const n=parseFloat(String(val).replace(/[^0-9.-]/g,""));
  return isNaN(n)?0:n;
}
function parseExcelDate(val) {
  if (!val && val!==0) return null;
  if (typeof val==="number") {
    try {
      const p=xlsx.SSF.parse_date_code(val);
      if (!p) return String(val);
      return String(p.y)+"-"+String(p.m).padStart(2,"0")+"-"+String(p.d).padStart(2,"0");
    } catch(e) { return String(val); }
  }
  return String(val).trim()||null;
}
const ALIASES={
  "SKU":["SKU","KODE","PRODUCT CODE","CODE","ID"],
  "DESCRIPTION":["DESCRIPTION","ITEM_DESCRIPTION","ITEM DESCRIPTION","NAMA","ITEM_DESCRIP"],
  "HARGA NORMAL":["HARGA NORMAL","HARGA","NORMAL PRICE","PRICE","HARGA JUAL","REGULAR PRICE"],
  "HARGA PROMO":["HARGA PROMO","PROMO PRICE","PROMO","HARGA DISKON"],
  "ARTICLE":["ARTICLE","ARTIKEL","BARCODE","PARENT_NAME","PARENT NAME"],
  "FROM DATE":["FROM DATE","DARI TANGGAL","START DATE","FROM"],
  "TO DATE":["TO DATE","SAMPAI TANGGAL","END DATE","TO","BERLAKU SAMPAI"],
  "DISKON":["DISKON","DISCOUNT","DISC"],
  "DISCOUNT TYPE":["DISCOUNT TYPE","TIPE DISKON"],
  "BRAND":["BRAND","MEREK","GROUP"],
  "DEPT":["DEPT","DEPARTMENT","KATEGORI","CATEGORY"],
  "ACARA":["ACARA","EVENT","PROMO NAME"],
  "STOK":["STOK","EOH_UNIT","EOH UNIT","EOH","QTY"],
  "SALES_MTD":["SALES_MTD","MTD_SALES_UNIT","MTD SALES UNIT","SALES MTD","MTD"],
  "MTD_SALES_RETAIL":["MTD_SALES_RETAIL","MTD SALES RETAIL"],
  "YTD_SALES_UNIT":["YTD_SALES_UNIT","YTD SALES UNIT","SUM OF YTD_SALES_UNIT"],
  "YTD_SALES_RETAIL":["YTD_SALES_RETAIL","YTD SALES RETAIL","SUM OF YTD_SALES_RETAIL"],
  "EOH_RETAIL":["EOH_RETAIL","EOH RETAIL","SUM OF EOH_RETAIL"],
  "BOY_UNIT":["BOY_UNIT","BOY UNIT","SUM OF BOY_UNIT"],
  "BOY_RETAIL":["BOY_RETAIL","BOY RETAIL","SUM OF BOY_RETAIL"],
};
function remap(row){
  const n={};
  for(const k of Object.keys(row)) n[k.trim().toUpperCase()]=row[k];
  const o={...n};
  for(const [std,als] of Object.entries(ALIASES)){
    if(std in o) continue;
    for(const a of als){ if(a in o){o[std]=o[a];break;} }
  }
  return o;
}
function _processFileInternal(filePath,map,isPromoFile){
  const wb=xlsx.read(fs.readFileSync(filePath),{type:"buffer",cellDates:false});
  for(const sn of wb.SheetNames){
    const ws=wb.Sheets[sn];
    const raw=xlsx.utils.sheet_to_json(ws,{header:1,defval:""});
    if(!raw.length) continue;
    const skuA=["SKU","KODE","PRODUCT CODE","CODE","ID"];
    let hi=0;
    for(let i=0;i<Math.min(20,raw.length);i++){
      if(raw[i].map(c=>String(c).trim().toUpperCase()).some(c=>skuA.includes(c))){hi=i;break;}
    }
    const hdrs=raw[hi].map(h=>String(h).trim());
    for(let i=hi+1;i<raw.length;i++){
      const ra=raw[i];
      if(!ra.some(v=>v!==""&&v!==undefined)) continue;
      const ro={};
      for(let j=0;j<hdrs.length;j++) if(hdrs[j]) ro[hdrs[j]]=ra[j]!==undefined?ra[j]:"";
      const row=remap(ro);
      const sku=String(row["SKU"]??"").trim();
      if(!sku) continue;
      let hN=safeFloat(row["HARGA NORMAL"]);
      if(hN===0){
        const eU=safeFloat(row["STOK"]),eR=safeFloat(row["EOH_RETAIL"]);
        const yU=safeFloat(row["YTD_SALES_UNIT"]),yR=safeFloat(row["YTD_SALES_RETAIL"]);
        const bU=safeFloat(row["BOY_UNIT"]),bR=safeFloat(row["BOY_RETAIL"]);
        let b=0;
        if(eU>0)b=eR/eU;else if(yU>0)b=yR/yU;else if(bU>0)b=bR/bU;
        if(b>0)hN=Math.round(b);
      }
      // Parse harga promo & diskon
      // Type SPECIAL PRICE = numeric HARGA PROMO → save as hargaPromo
      // Type BXGY / B1G1 / B2G1 = promo tipe khusus, save diskon as "B2G1" etc
      // Type AMOUNT / NORMAL = normal price, skip
      const discountTypeRaw = row["DISCOUNT TYPE"]!==undefined?String(row["DISCOUNT TYPE"]).trim().toUpperCase():"";
      const hargaPromoRaw = row["HARGA PROMO"]!==undefined?row["HARGA PROMO"]:"";
      const hargaPromoStr = String(hargaPromoRaw).trim().toUpperCase();
      const rawDiskonRaw = row["DISKON"]!==undefined?String(row["DISKON"]).trim():"";

      let hP=null;
      let diskon=null;

      if (discountTypeRaw==="SPECIAL PRICE" || discountTypeRaw==="SHARP PRICE") {
        // Harga tajam langsung → save as hargaPromo
        const v=safeFloat(hargaPromoRaw);
        hP=v>0?v:null;
        diskon="SP";
      } else if (discountTypeRaw==="BXGY" || hargaPromoStr.match(/^B\dG\d/) || hargaPromoStr==="B2G1" || hargaPromoStr==="B1G1") {
        // Promo tipe BXGY / B1G1 / B2G1 → tidak ada harga flat, tapi tetap promo
        hP=null;
        diskon=hargaPromoStr||rawDiskonRaw||"BXGY";
      } else if (rawDiskonRaw && rawDiskonRaw!=="0" && rawDiskonRaw!=="" && !isNaN(parseFloat(rawDiskonRaw))) {
        // Diskon persen/amount
        hP=null;
        diskon=rawDiskonRaw+"%";
      }
      // else: NORMAL PRICE = no promo, hP & diskon stay null
      const item={
        sku,
        description:row["DESCRIPTION"]!==undefined?String(row["DESCRIPTION"]).trim()||"-":"-",
        article:row["ARTICLE"]!==undefined?String(row["ARTICLE"]).trim()||null:null,
        hargaNormal:hN||0, hargaPromo:hP,
        diskon,
        discountType:discountTypeRaw||null,
        acara:row["ACARA"]!==undefined?String(row["ACARA"]).trim()||null:null,
        fromDate:row["FROM DATE"]!==undefined?parseExcelDate(row["FROM DATE"]):null,
        toDate:row["TO DATE"]!==undefined?parseExcelDate(row["TO DATE"]):null,
        brand:row["BRAND"]!==undefined?String(row["BRAND"]).trim()||null:null,
        dept:row["DEPT"]!==undefined?String(row["DEPT"]).trim()||null:null,
        stok:row["STOK"]!==undefined?parseInt(row["STOK"])||0:0,
        sales_mtd:row["SALES_MTD"]!==undefined?parseInt(row["SALES_MTD"])||0:0,
        sales_mtd_retail:safeFloat(row["MTD_SALES_RETAIL"]),
        sales_ytd:row["YTD_SALES_UNIT"]!==undefined?parseInt(row["YTD_SALES_UNIT"])||0:0,
        sales_ytd_retail:safeFloat(row["YTD_SALES_RETAIL"]),
        eoh_retail:safeFloat(row["EOH_RETAIL"]),
        color:null,size:null,bom_unit:0,day_sales_unit:0,day_sales_retail:0,lastPurchaseDate:null
      };
      const ex=map.get(sku);
      if(isPromoFile){
        // Promo file: HANYA update SKU yang sudah ada di PQ (jangan buat SKU baru tanpa stok)
        if(ex){
          const nP=item.hargaPromo>0||item.diskon;
          if(nP) map.set(sku,{...ex,hargaPromo:item.hargaPromo,diskon:item.diskon,discountType:item.discountType,acara:item.acara,fromDate:item.fromDate,toDate:item.toDate});
        }
        // else: SKU dari promo yang tidak ada di PQ → SKIP (tidak punya stok/data PQ)
      } else {
        // PQ file: tambah semua SKU baru
        if(!ex) map.set(sku,item);
        else map.set(sku,{...ex,...item}); // update semua data
      }
    }
  }
}
function processFilePromoOnly(filePath,map){
  // Wrapper khusus promo: set flag isPromoFile=true
  _processFileInternal(filePath,map,true);
}
function processFilePQ(filePath,map){
  _processFileInternal(filePath,map,false);
}
// Rename original processFile → _processFileInternal dengan parameter isPromoFile
async function main(){
  console.log("Wipe + inject ulang (date fix)...");
  await prisma.dailySales.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.syncHistory.deleteMany({});
  const map=new Map();
  processFilePQ(PQ_FILE,map);
  console.log("PQ SKU:",map.size);
  const promos=fs.readdirSync(PROMO_DIR).filter(f=>f.endsWith(".xlsx")&&!f.startsWith("~"));
  for(const f of promos) processFilePromoOnly(path.join(PROMO_DIR,f),map);
  console.log("After promo:",map.size);
  const items=Array.from(map.values());
  let tot=0;
  for(let i=0;i<items.length;i+=500){
    const r=await prisma.product.createMany({data:items.slice(i,i+500),skipDuplicates:true});
    tot+=r.count;
    process.stdout.write("\rInserted:"+tot+"/"+items.length);
  }
  const wP=await prisma.product.count({where:{hargaPromo:{not:null}}});
  const wD=await prisma.product.count({where:{diskon:{not:null}}});
  console.log("\nDone! Total:",await prisma.product.count(),"| hargaPromo:",wP,"| diskon:",wD);
}
main().catch(e=>{console.error(e.message);process.exit(1);}).finally(()=>prisma.$disconnect());

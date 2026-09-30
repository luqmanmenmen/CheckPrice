const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const rowPlaceholders = ["($1::text, $2::double precision, $3::text, $4::text, $5::text, $6::text, $7::int, $8::double precision, $9::int, $10::double precision, $11::int, $12::double precision, $13::int, $14::double precision, $15::int, $16::double precision, $17::double precision, $18::double precision, $19::text, $20::text, $21::text, $22::text, $23::text, $24::text)"];
  const values = [
    '61314165', 44144, 'desc', 'article', 'brand', 'dept', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, null, null, null, null, null, null
  ];

  const query = `
    UPDATE "Product" as p
    SET 
      "hargaNormal"      = COALESCE(v."hargaNormal",      p."hargaNormal"),
      "description"      = COALESCE(v."description",      p."description"),
      "article"          = COALESCE(v."article",          p."article"),
      "brand"            = COALESCE(v."brand",            p."brand"),
      "dept"             = COALESCE(v."dept",             p."dept"),
      "stok"             = COALESCE(v."stok",             p."stok"),
      "eoh_retail"       = COALESCE(v."eoh_retail",       p."eoh_retail"),
      "sales_mtd"        = COALESCE(v."sales_mtd",        p."sales_mtd"),
      "sales_mtd_retail" = COALESCE(v."sales_mtd_retail", p."sales_mtd_retail"),
      "sales_wtd"        = COALESCE(v."sales_wtd",        p."sales_wtd"),
      "sales_wtd_retail" = COALESCE(v."sales_wtd_retail", p."sales_wtd_retail"),
      "sales_ytd"        = COALESCE(v."sales_ytd",        p."sales_ytd"),
      "sales_ytd_retail" = COALESCE(v."sales_ytd_retail", p."sales_ytd_retail"),
      "boy_unit"         = COALESCE(v."boy_unit",         p."boy_unit"),
      "boy_retail"       = COALESCE(v."boy_retail",       p."boy_retail"),
      "hargaPromo"       = v."hargaPromo",
      "diskon"           = v."diskon",
      "discountType"     = v."discountType",
      "acara"            = v."acara",
      "fromDate"         = v."fromDate",
      "toDate"           = v."toDate",
      "promoFileName"    = COALESCE(v."promoFileName",    p."promoFileName"),
      "updatedAt"        = CURRENT_TIMESTAMP
    FROM (VALUES
      ${rowPlaceholders.join(", ")}
    ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "eoh_retail", "sales_mtd", "sales_mtd_retail", "sales_wtd", "sales_wtd_retail", "sales_ytd", "sales_ytd_retail", "boy_unit", "boy_retail", "omzetDelta", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "promoFileName")
    WHERE p."sku" = v."sku"
  `;

  try {
    const res = await prisma.$executeRawUnsafe(query, ...values);
    console.log("SUCCESS, rows updated:", res);
  } catch (err) {
    console.error("RAW QUERY ERROR:", err.message);
  }
}
run().catch(console.error).finally(()=>prisma.$disconnect());

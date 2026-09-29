const fs = require('fs');
const file = 'src/app/api/upload/route.ts';
let content = fs.readFileSync(file, 'utf8');

// Chunk 1
content = content.replace(
  const eoh_retail = row["EOH_RETAIL"] !== undefined ? safeFloat(row["EOH_RETAIL"]) : undefined;

  return {,
  const eoh_retail = row["EOH_RETAIL"] !== undefined ? safeFloat(row["EOH_RETAIL"]) : undefined;
  
  const color = row["COLOR"] !== undefined ? (String(row["COLOR"]).trim() || null) : undefined;
  const size = row["SIZE"] !== undefined ? (String(row["SIZE"]).trim() || null) : undefined;
  const lastPurchaseDate = row["LAST_PURCHASE_DATE"] !== undefined ? (String(row["LAST_PURCHASE_DATE"]).trim() || null) : undefined;
  const bom_unit = row["BOM_UNIT"] !== undefined && row["BOM_UNIT"] !== "" ? parseInt(row["BOM_UNIT"]) || 0 : undefined;
  const day_sales_unit = row["DAY_SALES_UNIT"] !== undefined && row["DAY_SALES_UNIT"] !== "" ? parseInt(row["DAY_SALES_UNIT"]) || 0 : undefined;
  const day_sales_retail = row["DAY_SALES_RETAIL"] !== undefined ? safeFloat(row["DAY_SALES_RETAIL"]) : undefined;

  return {
);

// Chunk 2
content = content.replace(
    sales_ytd,
    sales_ytd_retail,
    eoh_retail,
  };,
    sales_ytd,
    sales_ytd_retail,
    eoh_retail,
    color,
    size,
    lastPurchaseDate,
    bom_unit,
    day_sales_unit,
    day_sales_retail,
  };
);

// Chunk 3
content = content.replace(
        sales_ytd: item.sales_ytd ?? 0,
        sales_ytd_retail: item.sales_ytd_retail ?? 0,
        eoh_retail: item.eoh_retail ?? 0,
      });,
        sales_ytd: item.sales_ytd ?? 0,
        sales_ytd_retail: item.sales_ytd_retail ?? 0,
        eoh_retail: item.eoh_retail ?? 0,
        color: item.color ?? null,
        size: item.size ?? null,
        lastPurchaseDate: item.lastPurchaseDate ?? null,
        bom_unit: item.bom_unit ?? 0,
        day_sales_unit: item.day_sales_unit ?? 0,
        day_sales_retail: item.day_sales_retail ?? 0,
      });
);

// Chunk 4
content = content.replace(
  "BOY_RETAIL": ["BOY_RETAIL", "BOY RETAIL", "SUM OF BOY_RETAIL"]
};,
  "BOY_RETAIL": ["BOY_RETAIL", "BOY RETAIL", "SUM OF BOY_RETAIL"],
  "COLOR": ["COLOR", "WARNA"],
  "SIZE": ["SIZE", "UKURAN"],
  "LAST_PURCHASE_DATE": ["LAST_PURCHASE_DATE", "LAST PURCHASE DATE", "TGL BELI"],
  "BOM_UNIT": ["BOM UNIT", "BOM_UNIT"],
  "DAY_SALES_UNIT": ["DAY SALES UNIT", "DAY_SALES_UNIT"],
  "DAY_SALES_RETAIL": ["DAY SALES RETAIL", "DAY_SALES_RETAIL"]
};
);

// Chunk 5
content = content.replace(
        rowPlaceholders.push(\(\$\::text, \$\::double precision, \$\::text, \$\::text, \$\::text, \$\::text, \$\::int, \$\::int, \$\::int, \$\::double precision, \$\::int, \$\::double precision, \$\::double precision, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text)\);
        
        values.push(
          item.sku,
          item.hargaNormal !== undefined ? item.hargaNormal : null,
          item.description !== undefined ? item.description : null,
          item.article !== undefined ? item.article : null,
          item.brand !== undefined ? item.brand : null,
          item.dept !== undefined ? item.dept : null,
          item.stok !== undefined ? item.stok : null,
          salesDelta,
          item.sales_mtd !== undefined ? item.sales_mtd : null,
          item.sales_mtd_retail !== undefined ? item.sales_mtd_retail : null,
          item.sales_ytd !== undefined ? item.sales_ytd : null,
          item.sales_ytd_retail !== undefined ? item.sales_ytd_retail : null,
          item.eoh_retail !== undefined ? item.eoh_retail : null,
          finalPromoToSave,
          finalDiskonToSave,
          finalDiscountTypeToSave,
          finalAcaraToSave,
          finalFromDateToSave,
          finalToDateToSave
        );,
        rowPlaceholders.push(\(\$\::text, \$\::double precision, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text, \$\::int, \$\::int, \$\::int, \$\::double precision, \$\::int, \$\::double precision, \$\::double precision, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text, \$\::text, \$\::int, \$\::int, \$\::double precision)\);
        
        values.push(
          item.sku,
          item.hargaNormal !== undefined ? item.hargaNormal : null,
          item.description !== undefined ? item.description : null,
          item.article !== undefined ? item.article : null,
          item.brand !== undefined ? item.brand : null,
          item.dept !== undefined ? item.dept : null,
          item.color !== undefined ? item.color : null,
          item.size !== undefined ? item.size : null,
          item.lastPurchaseDate !== undefined ? item.lastPurchaseDate : null,
          item.stok !== undefined ? item.stok : null,
          salesDelta,
          item.sales_mtd !== undefined ? item.sales_mtd : null,
          item.sales_mtd_retail !== undefined ? item.sales_mtd_retail : null,
          item.sales_ytd !== undefined ? item.sales_ytd : null,
          item.sales_ytd_retail !== undefined ? item.sales_ytd_retail : null,
          item.eoh_retail !== undefined ? item.eoh_retail : null,
          finalPromoToSave,
          finalDiskonToSave,
          finalDiscountTypeToSave,
          finalAcaraToSave,
          finalFromDateToSave,
          finalToDateToSave,
          item.bom_unit !== undefined ? item.bom_unit : null,
          item.day_sales_unit !== undefined ? item.day_sales_unit : null,
          item.day_sales_retail !== undefined ? item.day_sales_retail : null
        );
);

// Chunk 6
content = content.replace(
                "sales_ytd_retail" = COALESCE(v."sales_ytd_retail", p."sales_ytd_retail"),
                "eoh_retail" = COALESCE(v."eoh_retail", p."eoh_retail"),
                "hargaPromo" = v."hargaPromo",
                "diskon" = v."diskon",
                "discountType" = v."discountType",
                "acara" = v."acara",
                "fromDate" = v."fromDate",
                "toDate" = v."toDate",
                "updatedAt" = CURRENT_TIMESTAMP
              FROM (VALUES
                \$\\{rowPlaceholders.join(", ")\\}
              ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "stok", "salesDelta", "sales_mtd", "sales_mtd_retail", "sales_ytd", "sales_ytd_retail", "eoh_retail", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate")
              WHERE p."sku" = v."sku",
                "sales_ytd_retail" = COALESCE(v."sales_ytd_retail", p."sales_ytd_retail"),
                "eoh_retail" = COALESCE(v."eoh_retail", p."eoh_retail"),
                "color" = COALESCE(v."color", p."color"),
                "size" = COALESCE(v."size", p."size"),
                "lastPurchaseDate" = COALESCE(v."lastPurchaseDate", p."lastPurchaseDate"),
                "bom_unit" = COALESCE(v."bom_unit", p."bom_unit"),
                "day_sales_unit" = COALESCE(v."day_sales_unit", p."day_sales_unit"),
                "day_sales_retail" = COALESCE(v."day_sales_retail", p."day_sales_retail"),
                "hargaPromo" = v."hargaPromo",
                "diskon" = v."diskon",
                "discountType" = v."discountType",
                "acara" = v."acara",
                "fromDate" = v."fromDate",
                "toDate" = v."toDate",
                "updatedAt" = CURRENT_TIMESTAMP
              FROM (VALUES
                \$\\{rowPlaceholders.join(", ")\\}
              ) AS v("sku", "hargaNormal", "description", "article", "brand", "dept", "color", "size", "lastPurchaseDate", "stok", "salesDelta", "sales_mtd", "sales_mtd_retail", "sales_ytd", "sales_ytd_retail", "eoh_retail", "hargaPromo", "diskon", "discountType", "acara", "fromDate", "toDate", "bom_unit", "day_sales_unit", "day_sales_retail")
              WHERE p."sku" = v."sku"
);

fs.writeFileSync(file, content);
console.log("Updated route.ts");

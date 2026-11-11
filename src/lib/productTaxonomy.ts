/**
 * productTaxonomy.ts
 * =============================================================================
 * Single Source of Truth untuk pengelompokan Brand (SUKO, Mu+Ku, ZES, Lainnya)
 * dan pengelompokan Kategori Produk (Jaket & Outer, Atasan, Celana, Dress & Rok,
 * Sepatu & Sandal, Tas & Aksesoris, Tidur & Dalam).
 * Digunakan bersama oleh Backend API, Offline Dexie Search, dan Frontend UI.
 * =============================================================================
 */

export type BrandGroupKey = "ALL" | "SUKO" | "MUKU" | "ZES";
export type ResolvedBrandGroup = Exclude<BrandGroupKey, "ALL">;

export type CategoryKey =
  | "ALL"
  | "JAKET"
  | "ATASAN"
  | "CELANA"
  | "DRESS_ROK"
  | "SEPATU_SANDAL"
  | "TAS_AKSESORIS"
  | "BEAUTY"
  | "TIDUR_DALAM"
  | "OTHER";

export type ResolvedCategoryKey = Exclude<CategoryKey, "ALL">;

export interface BrandGroupOption {
  key: BrandGroupKey;
  label: string;
  shortLabel: string;
  activeClass: string;
  idleClass: string;
  badgeClass: string;
}

export interface CategoryOption {
  key: CategoryKey;
  label: string;
  shortLabel: string;
  icon: string;
}

export const BRAND_GROUP_OPTIONS: BrandGroupOption[] = [
  {
    key: "ALL",
    label: "Semua Brand",
    shortLabel: "Semua",
    activeClass: "bg-slate-900 text-white border-slate-900 shadow-xs",
    idleClass: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  {
    key: "SUKO",
    label: "SUKO",
    shortLabel: "SUKO",
    activeClass: "bg-blue-600 text-white border-blue-700 shadow-xs",
    idleClass: "bg-blue-50/70 text-blue-700 border-blue-200 hover:bg-blue-100",
    badgeClass: "bg-blue-600 text-white border-blue-700",
  },
  {
    key: "MUKU",
    label: "Mu+Ku (Multibrand)",
    shortLabel: "Mu+Ku",
    activeClass: "bg-emerald-600 text-white border-emerald-700 shadow-xs",
    idleClass: "bg-emerald-50/70 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    badgeClass: "bg-emerald-600 text-white border-emerald-700",
  },
  {
    key: "ZES",
    label: "ZES",
    shortLabel: "ZES",
    activeClass: "bg-violet-600 text-white border-violet-700 shadow-xs",
    idleClass: "bg-violet-50/70 text-violet-700 border-violet-200 hover:bg-violet-100",
    badgeClass: "bg-violet-600 text-white border-violet-700",
  },
];

// Sub-brand populer yang berada di dalam toko Multibrand Mu+Ku
export const MUKU_SUB_BRANDS: string[] = [
  "NEVADA",
  "LITTLE M",
  "MAXMURAH",
  "DISNEY",
  "CHARACTER",
  "ST YVES",
  "COLE",
  "CONNEXION",
  "AOS",
  "VOLO",
  "SHE SENSE",
  "KHA",
  "KINN",
  "BYRCH & CO",
  "ANNISA",
  "SIRA",
  "CARDINAL",
  "CROCODILE",
  "NAYOUNG",
  "MUKU",
];

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: "ALL", label: "Semua Kategori", shortLabel: "Semua", icon: "📦" },
  { key: "JAKET", label: "Jaket & Outer", shortLabel: "Jaket", icon: "🧥" },
  { key: "ATASAN", label: "Atasan", shortLabel: "Atasan", icon: "👕" },
  { key: "CELANA", label: "Celana", shortLabel: "Celana", icon: "👖" },
  { key: "DRESS_ROK", label: "Dress & Rok", shortLabel: "Dress/Rok", icon: "👗" },
  { key: "SEPATU_SANDAL", label: "Sepatu & Sandal", shortLabel: "Sepatu", icon: "👟" },
  { key: "TAS_AKSESORIS", label: "Tas & Aksesoris", shortLabel: "Tas/Accs", icon: "👜" },
  { key: "BEAUTY", label: "Beauty & Skincare", shortLabel: "Beauty", icon: "💄" },
  { key: "TIDUR_DALAM", label: "Tidur & Dalam", shortLabel: "Tidur/Dalam", icon: "🛏️" },
];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  ALL: "Semua Kategori",
  JAKET: "Jaket & Outer",
  ATASAN: "Atasan",
  CELANA: "Celana",
  DRESS_ROK: "Dress & Rok",
  SEPATU_SANDAL: "Sepatu & Sandal",
  TAS_AKSESORIS: "Tas & Aksesoris",
  BEAUTY: "Beauty & Skincare",
  TIDUR_DALAM: "Tidur & Dalam",
  OTHER: "Lainnya",
};

export const CATEGORY_DISPLAY_ORDER: ResolvedCategoryKey[] = [
  "JAKET",
  "ATASAN",
  "CELANA",
  "DRESS_ROK",
  "SEPATU_SANDAL",
  "TAS_AKSESORIS",
  "BEAUTY",
  "TIDUR_DALAM",
  "OTHER",
];

// Kata kunci pencarian per kategori (sinkron antara filter SQL Prisma & classifier JS)
export const CATEGORY_KEYWORDS: Record<Exclude<CategoryKey, "ALL" | "OTHER">, string[]> = {
  JAKET: [
    "JAKET",
    "JACKET",
    "HOODIE",
    "HOODY",
    "SWEATER",
    "SWEATSHIRT",
    "CARDIGAN",
    "BLAZER",
    "OUTER",
    "OUTERWEAR",
    "BOMBER",
    "PARKA",
    "WINDBREAKER",
    "ROMPI",
    "VEST",
    "OVERSHIRT",
    "PULLOVER",
    "JUMPER",
    "COAT",
    "COACH",
  ],
  CELANA: [
    "CELANA",
    "PANTS",
    "JEANS",
    "JOGGER",
    "CHINO",
    "KARGO",
    "CARGO",
    "TROUSER",
    "TROUSERS",
    "CULOTTE",
    "KULOT",
    "LEGGING",
    "SHORT PANT",
    "SHORT PANTS",
    "SHORTS",
    "DENIM LONG",
    "WIDE LEG",
  ],
  DRESS_ROK: [
    "DRESS",
    "SACKDRESS",
    "GAUN",
    "SKIRT",
    "ROK",
    "SKORT",
    "GAMIS",
    "KAFTAN",
    "ABAYA",
    "TUNIK",
    "TUNIC",
    "JUMPSUIT",
    "OVERALL",
  ],
  ATASAN: [
    "T-SHIRT",
    "TSHIRT",
    "KAOS",
    "TEE",
    "KEMEJA",
    "SHIRT",
    "BLOUSE",
    "BLUS",
    "POLO",
    "TANK TOP",
    "ATASAN",
    "TURTLE NECK",
    "KNIT TOP",
    "WOVEN TOP",
    "TOP",
  ],
  SEPATU_SANDAL: [
    "SHOES",
    "SEPATU",
    "SANDAL",
    "SANDALS",
    "SLIPPER",
    "FLIP FLOP",
    "FLIP FLOPS",
    "SLIDE",
    "BALLERINA",
    "MOCCASIN",
    "SNEAKER",
    "SNEAKERS",
    "BOOTS",
    "LOAFER",
    "LOAFERS",
    "WEDGE",
    "WEDGES",
    "HEELS",
    "MULES",
    "SLINGBACK",
    "SOCK",
    "SOCKS",
    "KAOS KAKI",
  ],
  TAS_AKSESORIS: [
    "BAG",
    "SLINGBAG",
    "HANDBAG",
    "BACKPACK",
    "TOTE",
    "TOTEBAG",
    "RANSEL",
    "WALLET",
    "DOMPET",
    "TOPI",
    "CAP",
    "HAT",
    "BELT",
    "SABUK",
    "HAIR CLIP",
    "HAIRPIN",
    "HIJAB",
    "CIPUT",
    "MUG",
    "TUMBLER",
    "CUSHION",
    "DOLL",
    "PLUSH",
    "PAPERBAG",
    "CANVAS BAG",
    "STICKER",
    "STICKERS",
  ],
  BEAUTY: [
    "BLUSH",
    "LIP",
    "LIPSTICK",
    "LIPTINT",
    "SERUM",
    "TONER",
    "CONCEALER",
    "MOISTURIZER",
    "SUNSCREEN",
    "POWDER",
    "BROW",
    "EYE CARE",
    "ACNE",
    "PEEL OFF MASK",
    "FACIAL",
    "SKINCARE",
    "PERFUME",
    "RETINOL",
  ],
  TIDUR_DALAM: [
    "SLEEPWEAR",
    "PAJAMA",
    "PAJAMAS",
    "PYJAMA",
    "PYJAMAS",
    "PIYAMA",
    "UNDERWEAR",
    "BOXER",
    "BRA",
    "BRALETTE",
    "PANTY",
    "BRIEF",
    "SINGLET",
    "CAMISOLE",
    "DASTER",
    "NIGHTGOWN",
    "BABYDOL",
  ],
};

type TaxonomyInput = {
  brand?: string | null;
  dept?: string | null;
  article?: string | null;
  description?: string | null;
  name?: string | null;
};

/**
 * Mengklasifikasikan konsep/toko:
 * - SUKO (Monostore: brand/dept SUKO)
 * - ZES  (Monostore: brand/dept ZES)
 * - MUKU (Multibrand Mu+Ku: seluruh brand reguler & fashion non-SUKO dan non-ZES)
 */
export function classifyBrandGroup(p: TaxonomyInput): ResolvedBrandGroup {
  const brand = (p.brand || "").toUpperCase();
  const dept = (p.dept || "").toUpperCase();

  if (brand.includes("SUKO") || dept.includes("SUKO")) {
    return "SUKO";
  }

  if (brand.includes("ZES") || dept.includes("ZES")) {
    return "ZES";
  }

  return "MUKU";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Kompilasi regex batas kata sekali di awal agar "BLUSH" tidak pernah cocok sebagai "BLUS"
const CATEGORY_REGEX_MAP: Record<Exclude<CategoryKey, "ALL" | "OTHER">, RegExp> = Object.fromEntries(
  Object.entries(CATEGORY_KEYWORDS).map(([k, list]) => [
    k,
    new RegExp(`(?<![A-Z0-9])(?:${list.map(escapeRegExp).join("|")})(?![A-Z0-9])`, "i"),
  ])
) as Record<Exclude<CategoryKey, "ALL" | "OTHER">, RegExp>;

/**
 * Mengklasifikasikan kategori produk (presedensi dipilih agar Kosmetik seperti BLUSH VEIL LIQUID
 * tidak masuk ATASAN, "ROK PANJANG JEANS" masuk DRESS_ROK, dan "JACKET OVERSHIRT" masuk JAKET).
 */
export function classifyProductCategory(p: TaxonomyInput): ResolvedCategoryKey {
  const title = (p.description || p.name || "").split(":")[0].toUpperCase();
  const dept = (p.dept || "").toUpperCase();
  const brand = (p.brand || "").toUpperCase();
  const combined = `${title} ${dept}`;

  // 1. Kosmetik, Fragrance & Skincare (mencegah "BLUSH" / "TOP COAT" nyasar ke pakaian)
  if (
    dept.includes("NAYOUNG") ||
    dept.includes("COSMETIC") ||
    dept.includes("LA TULIPE") ||
    dept.includes("LT PRO") ||
    dept.includes("SOMETHINC") ||
    dept.includes("AMATERASUN") ||
    brand === "ELFORMULA" ||
    brand === "FRAGRANCE" ||
    CATEGORY_REGEX_MAP.BEAUTY.test(combined)
  ) {
    return "BEAUTY";
  }

  // 2. Tidur & Dalam (termasuk Boxer, Intimate & Sleepwear dept)
  if (
    dept.includes("SLEEPWEAR") ||
    dept.includes("UNDERWEAR") ||
    dept.includes("INTIMATE") ||
    brand === "INTIMATE" ||
    CATEGORY_REGEX_MAP.TIDUR_DALAM.test(combined)
  ) {
    return "TIDUR_DALAM";
  }

  // 3. Sepatu, Sandal & Kaos Kaki
  if (
    dept.includes("SHOES") ||
    dept.includes("FW") ||
    brand.includes("SHOES") ||
    CATEGORY_REGEX_MAP.SEPATU_SANDAL.test(title)
  ) {
    return "SEPATU_SANDAL";
  }

  // 4. Tas, Topi & Aksesoris / Home / Toys
  if (
    dept.includes("BAG") ||
    dept.includes("ACCS") ||
    dept.includes("ACCESSOR") ||
    dept.includes("TOYS") ||
    dept.includes("HOME") ||
    brand === "HANDBAGS" ||
    brand === "TRAVEL" ||
    brand === "ACCESSORIES" ||
    CATEGORY_REGEX_MAP.TAS_AKSESORIS.test(title)
  ) {
    return "TAS_AKSESORIS";
  }

  // 5. Dress, Rok & Skort (sebelum Celana & Atasan agar "ROK JEANS" tidak nyasar ke Celana)
  if (CATEGORY_REGEX_MAP.DRESS_ROK.test(title)) {
    return "DRESS_ROK";
  }

  // 6. Jaket, Hoodie, Sweater, Blazer, Vest (sebelum Atasan agar "JACKET OVERSHIRT" masuk Jaket)
  if (CATEGORY_REGEX_MAP.JAKET.test(title)) {
    return "JAKET";
  }

  // 7. Celana & Jeans
  if (CATEGORY_REGEX_MAP.CELANA.test(title)) {
    return "CELANA";
  }

  // 8. Atasan (Kaos, Kemeja, Blouse, Polo, Tank Top)
  if (CATEGORY_REGEX_MAP.ATASAN.test(title)) {
    return "ATASAN";
  }

  return "OTHER";
}

// Nama divisi ERP Matahari yang kolom `brand`-nya bukan merk asli (merk asli ada di kolom `dept`)
const ERP_DIVISION_AS_BRAND = new Set([
  "CHILDREN BOYS",
  "CHILDREN GIRLS",
  "CHILDREN SHOES",
  "LADIES SHOES",
  "MEN SHOES",
  "ACTIVE SHOES",
  "MEN CONTEMP CASUAL",
  "MEN YOUNG CASUAL",
  "YOUNG FASHION",
  "LADIES CONTEMP",
  "T-SHIRT GRAPHIC",
  "INTIMATE",
  "INFANTS & ESSENTIALS",
  "MEN FORMAL",
  "MEN ESSENTIALS",
  "HANDBAGS",
  "ACCESSORIES",
  "TRAVEL",
  "HOME",
  "TOYS",
  "FRAGRANCE",
  "LOCAL BRAND",
  "STORE OPERATION",
  "CUSTOMER SERVICE",
]);

/**
 * Mengembalikan nama merk/sub-brand yang bersih untuk pengelompokan di dalam Multibrand Mu+Ku
 * (selalu memecah divisi ERP seperti CHILDREN BOYS / LADIES CONTEMP ke merk aslinya di `dept`)
 */
export function getNormalizedSubBrand(p: TaxonomyInput): string {
  const brand = (p.brand || "").trim().toUpperCase();
  const dept = (p.dept || "").trim().toUpperCase();
  const article = (p.article || "").trim().toUpperCase();
  const desc = (p.description || p.name || "").trim().toUpperCase();

  // Normalisasi multi-divisi menjadi satu nama merk tunggal
  if (brand.includes("MAXMURAH") || dept.includes("MAXMURAH")) return "MAXMURAH";
  if (dept.includes("NAYOUNG") || desc.includes("NA-YOUNG") || brand === "ELFORMULA") return "NAYOUNG";
  if (brand.includes("BYRCH") || dept.includes("BYRCH")) return "BYRCH & CO";
  if (brand.includes("ST YVES") || brand.includes("SAINT YVES") || dept.includes("ST YVES") || dept.includes("SAINT YVES")) {
    return "ST YVES";
  }
  if (brand.includes("LITTLE M") || dept.includes("LITTLE M")) return "LITTLE M";
  if (
    brand.includes("MUKU") ||
    dept.includes("MUKU") ||
    article.startsWith("MK-") ||
    article.includes("-MK") ||
    desc.includes("MUKU") ||
    desc.includes("MU+KU")
  ) {
    return "MUKU";
  }

  // Ambil merk mentah: jika kolom `brand` adalah nama divisi (CHILDREN BOYS, MEN CONTEMP CASUAL, dll.), gunakan `dept`
  let raw = brand;
  if (!raw || ERP_DIVISION_AS_BRAND.has(raw)) {
    raw =
      dept &&
      !["MDS RETAIL", "DEFAULT", "INACTIVE BRAND"].includes(dept) &&
      !ERP_DIVISION_AS_BRAND.has(dept)
        ? dept
        : "";
  }
  if (!raw) {
    if (brand === "TOYS" || dept === "TOYS") return "GENERAL TOYS";
    return "LAINNYA";
  }

  if (raw.includes("NEVADA")) return "NEVADA";
  if (raw.includes("CONNEXION")) return "CONNEXION";
  if (raw === "COLE" || raw.startsWith("COLE ")) return "COLE";
  if (raw.includes("DISNEY") || raw === "THATS DONALD") return "DISNEY";
  if (raw.includes("SHE SENSE")) return "SHE SENSE";
  if (raw.startsWith("CARDINAL")) return "CARDINAL";
  if (raw.startsWith("CROCODILE")) return "CROCODILE";
  if (raw === "KHA" || raw === "KHA BAG") return "KHA";
  if (raw === "EXIT" || raw === "EXITKIDS") return "EXIT";
  if (raw.startsWith("OSELLA")) return "OSELLA";
  if (raw.startsWith("ARROW")) return "ARROW";
  if (raw.startsWith("PIERRE CARDIN")) return "PIERRE CARDIN";
  if (raw.startsWith("LEVIS")) return "LEVIS";
  if (raw === "AOS MENS" || raw === "AOS LADIES") return "AOS";
  if (raw === "LICENSE ESS" || raw === "LICENSE BABY" || raw === "LICENSE") return "CHARACTER";
  if (raw === "VOLO") return "VOLO";

  return raw;
}

export function getBrandGroupMeta(group: BrandGroupKey): BrandGroupOption {
  return BRAND_GROUP_OPTIONS.find((opt) => opt.key === group) || BRAND_GROUP_OPTIONS[0];
}

export function buildBrandPrismaWhere(brandGroup: BrandGroupKey): any | undefined {
  if (brandGroup === "ALL") return undefined;

  if (brandGroup === "SUKO") {
    return {
      OR: [
        { brand: { contains: "SUKO", mode: "insensitive" } },
        { dept: { contains: "SUKO", mode: "insensitive" } },
      ],
    };
  }

  if (brandGroup === "ZES") {
    return {
      OR: [
        { brand: { contains: "ZES", mode: "insensitive" } },
        { dept: { contains: "ZES", mode: "insensitive" } },
      ],
    };
  }

  // MUKU: toko multibrand (seluruh produk di luar Monostore SUKO & ZES)
  return {
    AND: [
      { NOT: { brand: { contains: "SUKO", mode: "insensitive" } } },
      { NOT: { dept: { contains: "SUKO", mode: "insensitive" } } },
      { NOT: { brand: { contains: "ZES", mode: "insensitive" } } },
      { NOT: { dept: { contains: "ZES", mode: "insensitive" } } },
    ],
  };
}

export function buildCategoryPrismaWhere(category: CategoryKey): any | undefined {
  if (category === "ALL" || category === "OTHER") return undefined;

  const keywords = CATEGORY_KEYWORDS[category];
  const branches: any[] = keywords.map((kw) => ({
    description: { contains: kw, mode: "insensitive" as const },
  }));

  if (category === "TIDUR_DALAM") {
    branches.push(
      { dept: { contains: "SLEEPWEAR", mode: "insensitive" } },
      { dept: { contains: "UNDERWEAR", mode: "insensitive" } },
      { dept: { contains: "INTIMATE", mode: "insensitive" } }
    );
  } else if (category === "SEPATU_SANDAL") {
    branches.push(
      { dept: { contains: "SHOES", mode: "insensitive" } },
      { dept: { contains: "FW", mode: "insensitive" } }
    );
  } else if (category === "TAS_AKSESORIS") {
    branches.push(
      { dept: { contains: "BAG", mode: "insensitive" } },
      { dept: { contains: "ACCS", mode: "insensitive" } },
      { dept: { contains: "HOME", mode: "insensitive" } },
      { dept: { contains: "TOYS", mode: "insensitive" } }
    );
  }

  return { OR: branches };
}

export interface SubBrandCount {
  name: string;
  count: number;
  photoCount: number;
}

export interface BrandShowcaseSection<T = any> {
  subBrand: string;
  count: number;
  totalSkus: number;
  items: T[];
}

export interface CategoryShowcaseSection<T = any> {
  catKey: ResolvedCategoryKey;
  label: string;
  icon: string;
  count: number;
  totalSkus: number;
  items: T[];
}

export function createEmptyCategoryCounts(): Record<CategoryKey, number> {
  return {
    ALL: 0,
    JAKET: 0,
    ATASAN: 0,
    CELANA: 0,
    DRESS_ROK: 0,
    SEPATU_SANDAL: 0,
    TAS_AKSESORIS: 0,
    BEAUTY: 0,
    TIDUR_DALAM: 0,
    OTHER: 0,
  };
}

const LOW_PRIORITY_SUBBRANDS = new Set([
  "LAINNYA",
  "DEFAULT",
  "MDS RETAIL",
  "INACTIVE BRAND",
  "STORE OPERATION",
  "CUSTOMER SERVICE",
  "PROMO MERCHANDISE",
  "PROMO MERCHANDISE DP",
  "GENERAL TOYS",
  "PLUSH TOYS",
  "TODDLER TOYS",
  "TOYS",
  "BOYS TOYS",
  "HOME LIVING",
  "HOME LIFESTYLE",
  "TEXTILE",
]);

/** Mengurutkan daftar sub-brand Mu+Ku dengan brand fashion berfoto dan terbanyak terlebih dahulu */
export function sortSubBrandStats<T extends { count: number; photoCount: number }>(
  list: T[],
  getName: (item: T) => string
): T[] {
  return list.sort((a, b) => {
    const aLow = LOW_PRIORITY_SUBBRANDS.has(getName(a)) ? 1 : 0;
    const bLow = LOW_PRIORITY_SUBBRANDS.has(getName(b)) ? 1 : 0;
    if (aLow !== bLow) return aLow - bLow;
    const aPhoto = a.photoCount > 0 ? 1 : 0;
    const bPhoto = b.photoCount > 0 ? 1 : 0;
    if (bPhoto !== aPhoto) return bPhoto - aPhoto;
    if (b.count !== a.count) return b.count - a.count;
    return getName(a).localeCompare(getName(b));
  });
}

/**
 * Mengelompokkan & memaginasi katalog Mu+Ku STRICT PER BRAND
 * sehingga setiap brand hanya muncul SEKALI pada tepat 1 halaman (tidak pernah dobel di Page 1 & Page 2).
 */
export function paginateBrandSections<
  T extends TaxonomyInput & {
    subBrand?: string | null;
    imageUrl?: string | null;
    articleGroupCount?: number;
  }
>(
  items: T[],
  page: number = 1,
  brandsPerPage: number = 8,
  itemsPerSection: number = 5
): {
  sections: BrandShowcaseSection<T>[];
  page: number;
  totalPages: number;
  totalBrands: number;
} {
  const secMap = new Map<string, BrandShowcaseSection<T> & { photoCount: number }>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sb = item.subBrand || getNormalizedSubBrand(item);
    let sec = secMap.get(sb);
    if (!sec) {
      sec = { subBrand: sb, count: 0, totalSkus: 0, photoCount: 0, items: [] };
      secMap.set(sb, sec);
    }
    sec.count += 1;
    sec.totalSkus += item.articleGroupCount || 1;
    if (item.imageUrl) sec.photoCount += 1;
    if (sec.items.length < itemsPerSection) {
      sec.items.push(item);
    }
  }
  const sorted = sortSubBrandStats(Array.from(secMap.values()), (x) => x.subBrand);
  const totalBrands = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalBrands / brandsPerPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * brandsPerPage;
  const sections = sorted.slice(skip, skip + brandsPerPage).map(({ photoCount: _p, ...rest }) => rest);
  return { sections, page: safePage, totalPages, totalBrands };
}

/** Compat helper returning top brand showcase sections from page 1 */
export function buildBrandShowcaseSections<
  T extends TaxonomyInput & {
    subBrand?: string | null;
    imageUrl?: string | null;
    articleGroupCount?: number;
  }
>(items: T[], maxSections: number = 8, itemsPerSection: number = 5): BrandShowcaseSection<T>[] {
  return paginateBrandSections(items, 1, maxSections, itemsPerSection).sections;
}

/**
 * Mengelompokkan & memaginasi katalog SUKO / ZES / 1-Brand STRICT PER KATEGORI
 * sehingga judul kategori tidak berulang di setiap halaman (anti-dobel lintas page).
 */
export function paginateCategorySections<
  T extends TaxonomyInput & {
    categoryKey?: ResolvedCategoryKey;
    imageUrl?: string | null;
    articleGroupCount?: number;
  }
>(
  items: T[],
  page: number = 1,
  categoriesPerPage: number = 5,
  itemsPerSection: number = 5
): {
  sections: CategoryShowcaseSection<T>[];
  page: number;
  totalPages: number;
  totalCategories: number;
} {
  const secMap = new Map<ResolvedCategoryKey, CategoryShowcaseSection<T>>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const catKey = item.categoryKey || classifyProductCategory(item);
    let sec = secMap.get(catKey);
    if (!sec) {
      sec = {
        catKey,
        label: CATEGORY_LABELS[catKey],
        icon: CATEGORY_OPTIONS.find((o) => o.key === catKey)?.icon || "📦",
        count: 0,
        totalSkus: 0,
        items: [],
      };
      secMap.set(catKey, sec);
    }
    sec.count += 1;
    sec.totalSkus += item.articleGroupCount || 1;
    if (sec.items.length < itemsPerSection) {
      sec.items.push(item);
    }
  }
  const ordered = CATEGORY_DISPLAY_ORDER
    .map((key) => secMap.get(key))
    .filter((sec): sec is CategoryShowcaseSection<T> => Boolean(sec && sec.items.length > 0));
  const totalCategories = ordered.length;
  const totalPages = Math.max(1, Math.ceil(totalCategories / categoriesPerPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const skip = (safePage - 1) * categoriesPerPage;
  return {
    sections: ordered.slice(skip, skip + categoriesPerPage),
    page: safePage,
    totalPages,
    totalCategories,
  };
}

/** Mengurutkan item agar produk berfoto & berstok tampil paling depan saat menjelajah katalog */
export function compareBrowseItems<
  T extends {
    imageUrl?: string | null;
    articleTotalStok?: number;
    stok?: number;
    articleHasPromo?: boolean;
    hargaPromo?: number | null;
    description?: string | null;
    name?: string | null;
  }
>(a: T, b: T): number {
  const aPhoto = a.imageUrl ? 1 : 0;
  const bPhoto = b.imageUrl ? 1 : 0;
  if (bPhoto !== aPhoto) return bPhoto - aPhoto;
  const aStok = a.articleTotalStok ?? a.stok ?? 0;
  const bStok = b.articleTotalStok ?? b.stok ?? 0;
  const aHasStok = aStok > 0 ? 1 : 0;
  const bHasStok = bStok > 0 ? 1 : 0;
  if (bHasStok !== aHasStok) return bHasStok - aHasStok;
  if (bStok !== aStok) return bStok - aStok;
  const aPromo = a.articleHasPromo || Boolean(a.hargaPromo) ? 1 : 0;
  const bPromo = b.articleHasPromo || Boolean(b.hargaPromo) ? 1 : 0;
  if (bPromo !== aPromo) return bPromo - aPromo;
  return (a.description || a.name || "").localeCompare(b.description || b.name || "");
}


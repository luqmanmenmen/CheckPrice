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
  "CONNEXION",
  "COLE",
  "MAXMURAH",
  "ST YVES",
  "VOLO",
  "BYRCH & CO",
  "MUKU",
  "DISNEY",
  "SIRA",
  "DETAILS",
];

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: "ALL", label: "Semua Kategori", shortLabel: "Semua", icon: "📦" },
  { key: "JAKET", label: "Jaket & Outer", shortLabel: "Jaket", icon: "🧥" },
  { key: "ATASAN", label: "Atasan", shortLabel: "Atasan", icon: "👕" },
  { key: "CELANA", label: "Celana", shortLabel: "Celana", icon: "👖" },
  { key: "DRESS_ROK", label: "Dress & Rok", shortLabel: "Dress/Rok", icon: "👗" },
  { key: "SEPATU_SANDAL", label: "Sepatu & Sandal", shortLabel: "Sepatu", icon: "👟" },
  { key: "TAS_AKSESORIS", label: "Tas & Aksesoris", shortLabel: "Tas/Accs", icon: "👜" },
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
  "TIDUR_DALAM",
  "OTHER",
];

// Kata kunci pencarian per kategori (sinkron antara filter SQL Prisma & classifier JS)
export const CATEGORY_KEYWORDS: Record<Exclude<CategoryKey, "ALL" | "OTHER">, string[]> = {
  JAKET: [
    "JAKET",
    "JACKET",
    "HOODIE",
    "SWEATER",
    "SWEATSHIRT",
    "CARDIGAN",
    "BLAZER",
    "OUTER",
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
    "CULOTTE",
    "KULOT",
    "LEGGING",
    "SHORT PANT",
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
    "TOP ",
  ],
  SEPATU_SANDAL: [
    "SHOES",
    "SEPATU",
    "SANDAL",
    "SANDALS",
    "SLIPPER",
    "FLIP FLOP",
    "SLIDE",
    "BALLERINA",
    "MOCCASIN",
    "SNEAKER",
    "BOOTS",
    "LOAFER",
    "WEDGE",
    "HEELS",
    "MULES",
    "SLINGBACK",
    "SOCK",
    "KAOS KAKI",
  ],
  TAS_AKSESORIS: [
    "BAG",
    "SLINGBAG",
    "HANDBAG",
    "BACKPACK",
    "TOTE",
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
    "CUSHION",
    "DOLL",
    "PLUSH",
    "PAPERBAG",
    "CANVAS BAG",
  ],
  TIDUR_DALAM: [
    "SLEEPWEAR",
    "PAJAMA",
    "PYJAMA",
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

function hasAnyKeyword(haystack: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (haystack.includes(kw)) return true;
  }
  return false;
}

/**
 * Mengklasifikasikan kategori produk (presedensi dipilih agar item gabungan seperti
 * "ROK PANJANG JEANS" masuk DRESS_ROK dan "JACKET OVERSHIRT" tetap masuk JAKET).
 */
export function classifyProductCategory(p: TaxonomyInput): ResolvedCategoryKey {
  const title = (p.description || p.name || "").split(":")[0].toUpperCase();
  const dept = (p.dept || "").toUpperCase();
  const combined = `${title} ${dept}`;

  // 1. Tidur & Dalam (termasuk Boxer & Sleepwear dept)
  if (
    dept.includes("SLEEPWEAR") ||
    dept.includes("UNDERWEAR") ||
    dept.includes("INTIMATE") ||
    hasAnyKeyword(combined, CATEGORY_KEYWORDS.TIDUR_DALAM)
  ) {
    return "TIDUR_DALAM";
  }

  // 2. Sepatu, Sandal & Kaos Kaki
  if (
    dept.includes("SHOES") ||
    dept.includes("FW") ||
    hasAnyKeyword(title, CATEGORY_KEYWORDS.SEPATU_SANDAL)
  ) {
    return "SEPATU_SANDAL";
  }

  // 3. Tas, Topi & Aksesoris / Home / Toys
  if (
    dept.includes("BAG") ||
    dept.includes("ACCS") ||
    dept.includes("ACCESSOR") ||
    dept.includes("TOYS") ||
    dept.includes("HOME") ||
    hasAnyKeyword(title, CATEGORY_KEYWORDS.TAS_AKSESORIS)
  ) {
    return "TAS_AKSESORIS";
  }

  // 4. Dress, Rok & Skort (sebelum Celana & Atasan agar "ROK JEANS" tidak nyasar ke Celana)
  if (hasAnyKeyword(title, CATEGORY_KEYWORDS.DRESS_ROK)) {
    return "DRESS_ROK";
  }

  // 5. Jaket, Hoodie, Sweater, Blazer, Vest (sebelum Atasan agar "JACKET OVERSHIRT" masuk Jaket)
  if (hasAnyKeyword(title, CATEGORY_KEYWORDS.JAKET)) {
    return "JAKET";
  }

  // 6. Celana & Jeans
  if (hasAnyKeyword(title, CATEGORY_KEYWORDS.CELANA)) {
    return "CELANA";
  }

  // 7. Atasan (Kaos, Kemeja, Blouse, Polo, Tank Top)
  if (hasAnyKeyword(title, CATEGORY_KEYWORDS.ATASAN)) {
    return "ATASAN";
  }

  return "OTHER";
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


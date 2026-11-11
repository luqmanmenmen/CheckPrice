/**
 * smartSearchEngine.ts
 * =============================================================================
 * MESIN PINTAR PENCARIAN RITEL (30% PARTIAL TEXT + BILINGUAL SYNONYM + GEMINI AI)
 * Mendukung pencarian manual via:
 * 1. Nomor SKU (8 digit) & Barcode Batang (12-13 digit EAN/UPC)
 * 2. Kode Artikel / StyleCode (misal: T1M124A1, MK-WT01, S2S084D1)
 * 3. Nama Deskripsi Penuh maupun 30% Potongan Teks / Singkatan Kasir
 *    (misal: "swet nev bear", "kmj col htm", "kaos suko vnl", "spt flt wnt")
 * 4. Bahasa Alami / Keinginan Pelanggan dengan Bantuan Gemini AI Agent
 * =============================================================================
 */

import {
  classifyBrandGroup,
  classifyProductCategory,
  ResolvedBrandGroup,
  ResolvedCategoryKey,
} from "./productTaxonomy";

export interface ExpandedRetailQuery {
  raw: string;
  cleaned: string;
  spaceless: string;
  tokens: string[];
  /** Setiap elemen mewakili 1 kata kunci user beserta seluruh sinonim & stem 30%-nya */
  tokenGroups: string[][];
  /** Seluruh kata kunci gabungan untuk Relaxed OR (30% match) */
  allExpandedTerms: string[];
}

// Kata sambung / filler bahasa percakapan yang diabaikan agar tidak merusak filter AND
const STOPWORDS = new Set([
  "CARI", "CARIIN", "CARIKAN", "TOLONG", "ADA", "GAK", "GA", "NGGAK", "ENGGA",
  "YANG", "YG", "UNTUK", "BUAT", "DARI", "DI", "KE", "DENGAN", "DGN", "WARNA",
  "UKURAN", "SIZE", "MODEL", "TIPE", "BARANG", "PRODUK", "ITEM", "DONG", "YA",
  "KAK", "MAS", "MBAK", "PAK", "BU", "AKU", "MAU", "PINGIN", "PENGEN", "LIHAT",
  "CEK", "HARGA", "STOK", "STOCK", "BERAPA", "APA", "INI", "ITU",
]);

// Kamus Sinonim & Singkatan Kasir (30% Teks Indonesia <-> Istilah ERP Matahari)
const RETAIL_SYNONYM_DICTIONARY: Record<string, string[]> = {
  // Kategori Pakaian Atas
  "KAOS": ["KAOS", "T-SHIRT", "TSHIRT", "TEE", "GRAPHICS TEE", "POLO", "OBLONG", "TOP"],
  "TSHIRT": ["T-SHIRT", "TSHIRT", "KAOS", "TEE"],
  "TEE": ["TEE", "T-SHIRT", "TSHIRT", "KAOS"],
  "OBLONG": ["T-SHIRT", "TSHIRT", "KAOS", "TEE"],
  "POLO": ["POLO", "WOVEN POLO", "KAOS KERAH"],
  "KEMEJA": ["KEMEJA", "SHIRT", "WOVEN SHIRT", "CASUAL SHIRT", "FORMAL SHIRT"],
  "KMJ": ["KEMEJA", "SHIRT", "WOVEN SHIRT"],
  "HEM": ["KEMEJA", "SHIRT", "SHORT SLEEVE"],
  "BLOUSE": ["BLOUSE", "BLUS", "ATASAN", "WOVEN TOP", "KNIT TOP", "TUNIK", "TUNIC"],
  "BLUS": ["BLOUSE", "BLUS", "ATASAN", "TOP"],
  "ATASAN": ["TOP", "BLOUSE", "SHIRT", "T-SHIRT", "TUNIK", "SWEATER"],
  "TUNIK": ["TUNIC", "TUNIK", "BLOUSE", "LONG TOP"],
  "GAMIS": ["DRESS", "MAXI DRESS", "GAMIS", "KAFTAN", "ABAYA"],
  "DRESS": ["DRESS", "GAUN", "TERUSAN", "MIDI DRESS", "MINI DRESS"],
  "DRES": ["DRESS", "TERUSAN"],
  "TERUSAN": ["DRESS", "JUMPSUIT", "OVERALL"],

  // Luaran / Jaket / Sweater (Termasuk potongan 30% seperti "swet", "jkt", "hodi")
  "SWEATER": ["SWEATER", "SWEATSHIRT", "PULLOVER", "CARDIGAN", "HOODIE", "KNIT"],
  "SWET": ["SWEATER", "SWEATSHIRT", "PULLOVER", "HOODIE"],
  "SWITER": ["SWEATER", "SWEATSHIRT", "PULLOVER", "HOODIE"],
  "SWEAT": ["SWEATER", "SWEATSHIRT", "HOODIE"],
  "HOODIE": ["HOODIE", "JACKET", "SWEATSHIRT", "PULLOVER", "JUMPER"],
  "HODIE": ["HOODIE", "JACKET", "SWEATSHIRT"],
  "HODI": ["HOODIE", "SWEATSHIRT", "JACKET"],
  "JAKET": ["JACKET", "JAKET", "HOODIE", "BOMBER", "PARKA", "WINDBREAKER", "OUTER"],
  "JKT": ["JACKET", "JAKET", "HOODIE", "OUTER"],
  "KARDIGAN": ["CARDIGAN", "SWEATER", "OUTER", "KNIT"],
  "KRDGN": ["CARDIGAN", "SWEATER"],
  "CARDI": ["CARDIGAN", "SWEATER"],
  "ROMPI": ["VEST", "ROMPI", "SLEEVELESS"],

  // Bawahan / Celana / Rok
  "CELANA": ["CELANA", "PANTS", "TROUSERS", "JEANS", "DENIM", "SHORT", "JOGGER", "CHINO", "CARGO", "CULOTTE", "LEGGING"],
  "CLN": ["CELANA", "PANTS", "TROUSERS", "JEANS", "SHORT", "JOGGER", "CHINO"],
  "PANTS": ["PANTS", "CELANA", "TROUSERS", "JOGGER", "CHINO"],
  "JEANS": ["JEANS", "DENIM", "PANTS", "CELANA"],
  "JNS": ["JEANS", "DENIM"],
  "PENDEK": ["SHORT", "SHORTS", "BERMUDA", "S/S", "SHORT SLEEVE", "PENDEK"],
  "PDK": ["SHORT", "SHORTS", "S/S", "PENDEK"],
  "PANJANG": ["LONG", "L/S", "LONG SLEEVE", "PANTS", "TROUSERS", "PANJANG"],
  "PJG": ["LONG", "L/S", "PANTS", "PANJANG"],
  "ROK": ["SKIRT", "ROK", "MINI SKIRT", "MIDI SKIRT", "MAXI SKIRT"],
  "KULOT": ["CULOTTE", "WIDE LEG", "PANTS"],
  "LEGGING": ["LEGGING", "TIGHTS", "PANTS"],
  "JOGGER": ["JOGGER", "SWEATPANTS", "TRACKPANTS", "PANTS"],

  // Pakaian Dalam & Baju Tidur
  "CD": ["BRIEF", "PANTY", "UNDERWEAR", "BOXER", "TRUNK", "INTIMATE"],
  "BOXER": ["BOXER", "TRUNK", "BRIEF", "UNDERWEAR"],
  "BH": ["BRA", "BRALETTE", "UNDERWEAR", "INTIMATE"],
  "BRA": ["BRA", "BRALETTE", "INTIMATE"],
  "DALAM": ["UNDERWEAR", "INTIMATE", "BRIEF", "BOXER", "BRA", "SINGLET", "CAMISOLE"],
  "TIDUR": ["SLEEPWEAR", "PAJAMAS", "PYJAMAS", "BABYDOL", "NIGHTGOWN", "PIYAMA"],
  "PIYAMA": ["PAJAMAS", "PYJAMAS", "SLEEPWEAR", "PIYAMA"],
  "DASTER": ["SLEEPWEAR", "NIGHTGOWN", "HOME DRESS", "BABYDOL"],
  "KAOSKAKI": ["SOCK", "SOCKS", "KAOS KAKI"],
  "KAKI": ["SOCK", "SOCKS", "FOOTWEAR"],

  // Sepatu & Sandal
  "SEPATU": ["SHOES", "SEPATU", "SNEAKERS", "SLIP ON", "LOAFERS", "FLAT", "HEELS", "BOOTS", "FOOTWEAR"],
  "SPT": ["SHOES", "SEPATU", "SNEAKERS", "FLAT", "FOOTWEAR"],
  "SANDAL": ["SANDAL", "SANDALS", "SLIPPER", "SLIDE", "FLIP FLOP", "WEDGES", "MULES"],
  "SENDAL": ["SANDAL", "SANDALS", "SLIPPER", "SLIDE", "WEDGES"],
  "SNDL": ["SANDAL", "SANDALS", "SLIPPER", "SLIDE"],
  "FLAT": ["FLAT", "FLATS", "BALLET", "BALLERINA", "SHOES"],
  "FLT": ["FLAT", "FLATS", "SHOES"],
  "HEELS": ["HEELS", "HIGH HEELS", "PUMPS", "WEDGES"],
  "SNEAKER": ["SNEAKERS", "SNEAKER", "SHOES", "ACTIVE SHOES"],

  // Tas & Aksesoris
  "TAS": ["BAG", "HANDBAG", "BACKPACK", "TOTE", "SLING", "SHOULDER BAG", "POUCH", "WALLET", "TAS"],
  "RANSEL": ["BACKPACK", "RUCKSACK", "BAG", "TAS"],
  "DOMPET": ["WALLET", "PURSE", "CLUTCH", "CARD HOLDER"],
  "TOPI": ["CAP", "HAT", "BUCKET HAT", "BEANIE", "TOPI"],
  "SABUK": ["BELT", "IKAT PINGGANG"],

  // Gender & Usia
  "PRIA": ["MEN", "MENS", "MAN", "PRIA", "GENTS", "COWOK"],
  "COWOK": ["MEN", "MENS", "PRIA", "BOYS"],
  "COWO": ["MEN", "MENS", "PRIA", "BOYS"],
  "LAKI": ["MEN", "MENS", "PRIA", "BOYS"],
  "WANITA": ["LADIES", "WOMEN", "WOMENS", "WOMAN", "WANITA", "GIRL", "GIRLS"],
  "CEWEK": ["LADIES", "WOMEN", "WOMENS", "WANITA", "GIRLS"],
  "CEWE": ["LADIES", "WOMEN", "WANITA", "GIRLS"],
  "WNT": ["WANITA", "LADIES", "WOMEN"],
  "ANAK": ["KIDS", "CHILDREN", "BOYS", "GIRLS", "BABY", "INFANTS", "ANAK", "YOUTH", "JUNIOR"],
  "ANK": ["KIDS", "CHILDREN", "BOYS", "GIRLS", "ANAK"],
  "BAYI": ["BABY", "INFANTS", "INFANT", "NEWBORN", "TODDLER"],

  // Warna (Indonesia & Singkatan 30% <-> English ERP)
  "HITAM": ["BLACK", "BLK", "CHARCOAL", "JET BLACK", "HITAM"],
  "HTM": ["BLACK", "BLK", "CHARCOAL", "HITAM"],
  "BLK": ["BLACK", "BLK", "HITAM"],
  "PUTIH": ["WHITE", "WHT", "OFF WHITE", "IVORY", "BROKEN WHITE", "PUTIH"],
  "PTH": ["WHITE", "WHT", "OFF WHITE", "IVORY", "PUTIH"],
  "MERAH": ["RED", "MAROON", "BURGUNDY", "CRIMSON", "CHERRY", "TERRACOTTA", "MERAH"],
  "MRH": ["RED", "MAROON", "BURGUNDY", "MERAH"],
  "BIRU": ["BLUE", "NAVY", "LIGHT BLUE", "ROYAL BLUE", "DENIM", "INDIGO", "COBALT", "TEAL", "BIRU"],
  "NVY": ["NAVY", "NAVY BLUE", "DARK BLUE"],
  "HIJAU": ["GREEN", "OLIVE", "SAGE", "MINT", "EMERALD", "ARMY", "JADE", "FOREST", "LIME", "HIJAU"],
  "IJO": ["GREEN", "OLIVE", "SAGE", "MINT", "ARMY", "HIJAU"],
  "KUNING": ["YELLOW", "MUSTARD", "LEMON", "GOLD", "BANANA", "KUNING"],
  "KNG": ["YELLOW", "MUSTARD", "KUNING"],
  "ABU": ["GREY", "GRAY", "DARK GREY", "LIGHT GREY", "MISTY", "CHARCOAL", "SILVER", "ABU"],
  "COKLAT": ["BROWN", "KHAKI", "BEIGE", "CHOCO", "MOCHA", "CAMEL", "TAN", "COFFEE", "WOOD", "COKLAT"],
  "CKLT": ["BROWN", "KHAKI", "BEIGE", "CHOCO", "MOCHA", "COKLAT"],
  "KREM": ["CREAM", "BEIGE", "VANILLA", "SAND", "KHAKI", "IVORY", "ALMOND", "OAT"],
  "VNL": ["VANILLA", "CREAM", "BEIGE"],
  "PINK": ["PINK", "DUSTY PINK", "BLUSH", "ROSE", "FUCHSIA", "SALMON", "CORAL", "MAGENTA"],
  "UNGU": ["PURPLE", "LILAC", "LAVENDER", "VIOLET", "PLUM", "MAUVE", "EGGPLANT"],
  "ORANYE": ["ORANGE", "CORAL", "PEACH", "TERRACOTTA", "RUST"],
  "OREN": ["ORANGE", "CORAL", "PEACH", "TERRACOTTA"],

  // Brand Shorthand (30% Nama Merk)
  "NEV": ["NEVADA"],
  "NVD": ["NEVADA"],
  "SUK": ["SUKO"],
  "SKO": ["SUKO"],
  "COL": ["COLE"],
  "CON": ["CONNEXION"],
  "CNX": ["CONNEXION"],
  "LTL": ["LITTLE M", "LITTLE"],
  "LTLM": ["LITTLE M"],
  "STY": ["ST YVES", "SAINT YVES"],
  "YVES": ["ST YVES", "SAINT YVES"],
  "MXM": ["MAXMURAH", "MXM"],
  "MAX": ["MAXMURAH"],
  "BYR": ["BYRCH", "BYRCH & CO"],
  "MUK": ["MUKU"],
  "MKU": ["MUKU"],
  "VLO": ["VOLO"],
  "DTL": ["DETAILS"],
  "CRD": ["CARDINAL"],
  "DSN": ["DISNEY"],
};

/**
 * Mengekspansi input pencarian manual menjadi grup sinonim dwi-bahasa & stem 30%
 */
export function expandRetailQuery(rawInput: string): ExpandedRetailQuery {
  const raw = rawInput.trim();
  const upper = raw.toUpperCase();
  const spaceless = upper.replace(/[\s\-_.:/]+/g, "");

  // Pisahkan kata berdasarkan spasi atau tanda baca (tetap jaga kode artikel jika utuh)
  const rawTokens = upper
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Jika semua kata adalah stopwords, gunakan rawTokens apa adanya
  const filteredTokens = rawTokens.filter((t) => !STOPWORDS.has(t));
  const tokens = filteredTokens.length > 0 ? filteredTokens : rawTokens;

  const tokenGroups: string[][] = [];
  const allSet = new Set<string>();

  for (const tok of tokens) {
    const group = new Set<string>();
    group.add(tok);
    const cleanTok = tok.replace(/[^A-Z0-9]/g, "");
    if (cleanTok.length >= 2) group.add(cleanTok);

    // 1. Cek kamus sinonim langsung
    let matchedDict = false;
    if (RETAIL_SYNONYM_DICTIONARY[tok]) {
      matchedDict = true;
      for (const syn of RETAIL_SYNONYM_DICTIONARY[tok]) group.add(syn);
    }
    if (cleanTok && RETAIL_SYNONYM_DICTIONARY[cleanTok]) {
      matchedDict = true;
      for (const syn of RETAIL_SYNONYM_DICTIONARY[cleanTok]) group.add(syn);
    }

    // 2. Cek kecocokan awalan 30% pada kunci kamus (misal user ketik "sweat" atau "cardig" atau "nevad")
    if (cleanTok.length >= 3) {
      for (const [dictKey, syns] of Object.entries(RETAIL_SYNONYM_DICTIONARY)) {
        if (dictKey.length >= 4 && (dictKey.startsWith(cleanTok) || cleanTok.startsWith(dictKey))) {
          matchedDict = true;
          group.add(dictKey);
          for (const s of syns.slice(0, 4)) group.add(s);
        }
      }
    }

    // 3. Stemming typo hanya jika belum cocok di kamus sinonim dan kata cukup panjang (>= 6 huruf)
    if (!matchedDict && cleanTok.length >= 6 && !/^\d+$/.test(cleanTok)) {
      group.add(cleanTok.slice(0, 4));
    }

    const arr = Array.from(group);
    tokenGroups.push(arr);
    for (const item of arr) allSet.add(item);
  }

  return {
    raw,
    cleaned: tokens.join(" "),
    spaceless,
    tokens,
    tokenGroups,
    allExpandedTerms: Array.from(allSet),
  };
}

/**
 * Menghitung kemiripan teks parsial (30% Partial Text, Trigram/Bigram & Ordered Subsequence)
 */
export function computePartialTextSimilarity(queryUpper: string, targetUpper: string): number {
  if (!queryUpper || !targetUpper) return 0;
  const qClean = queryUpper.replace(/[^A-Z0-9]/g, "");
  const tClean = targetUpper.replace(/[^A-Z0-9]/g, "");
  if (!qClean || !tClean) return 0;

  if (tClean.includes(qClean)) return 1.0;

  // 1. Character Bigram Overlap (tahan terhadap typo dan potongan kata 30%)
  if (qClean.length >= 3) {
    const qBigrams: string[] = [];
    for (let i = 0; i < qClean.length - 1; i++) {
      qBigrams.push(qClean.slice(i, i + 2));
    }
    let hit = 0;
    for (const bg of qBigrams) {
      if (tClean.includes(bg)) hit++;
    }
    const bigramRatio = hit / qBigrams.length;

    // 2. Ordered Subsequence Check (misal "swetbr" -> "SWEATER BEAR")
    let qIdx = 0;
    for (let tIdx = 0; tIdx < tClean.length && qIdx < qClean.length; tIdx++) {
      if (tClean[tIdx] === qClean[qIdx]) qIdx++;
    }
    const subseqRatio = qIdx / qClean.length;

    return Math.max(bigramRatio, subseqRatio * 0.9);
  }

  return 0;
}

/**
 * Menghitung skor relevansi cerdas sebuah produk terhadap query yang sudah diekspansi
 */
export function computeProductRelevanceScore(
  p: {
    sku?: string | null;
    barcode?: string | null;
    article?: string | null;
    description?: string | null;
    brand?: string | null;
    dept?: string | null;
    color?: string | null;
    size?: string | null;
    stok?: number | null;
    hargaNormal?: number | null;
    imageUrl?: string | null;
  },
  expanded: ExpandedRetailQuery,
  isSearchingDummy: boolean = false
): number {
  let score = 0;
  const qUpper = expanded.raw.toUpperCase();
  const qSpaceless = expanded.spaceless;

  const artUpper = (p.article || "").toUpperCase();
  const descUpper = (p.description || "").toUpperCase();
  const brandUpper = (p.brand || "").toUpperCase();
  const deptUpper = (p.dept || "").toUpperCase();
  const skuUpper = (p.sku || "").toUpperCase();
  const barcodeUpper = (p.barcode || "").toUpperCase();
  const colorUpper = (p.color || "").toUpperCase();
  const sizeUpper = (p.size || "").toUpperCase();

  const fullIdentity = `${brandUpper} ${deptUpper} ${artUpper} ${descUpper} ${colorUpper} ${sizeUpper}`;
  const artSpaceless = artUpper.replace(/[\s\-_.:/]+/g, "");
  const descSpaceless = descUpper.replace(/[\s\-_.:/]+/g, "");
  const brandSpaceless = brandUpper.replace(/[\s\-_.:/]+/g, "");
  const deptSpaceless = deptUpper.replace(/[\s\-_.:/]+/g, "");

  // 1. Exact Match pada SKU / Barcode / Artikel / Brand / Dept / Deskripsi
  if (skuUpper === qUpper || barcodeUpper === qUpper) score += 500;
  if (artUpper === qUpper) score += 450;
  else if (artSpaceless === qSpaceless && qSpaceless.length >= 3) score += 420;
  else if (deptUpper === qUpper) score += 300;
  else if (brandUpper === qUpper) score += 280;
  else if (descUpper === qUpper) score += 270;

  // 2. Prefix / Substring Match untuk Kode Artikel, SKU, atau Barcode (ketik sebagian kode)
  if (qSpaceless.length >= 3) {
    if (artUpper.startsWith(qUpper) || artSpaceless.startsWith(qSpaceless)) score += 240;
    else if (artUpper.includes(qUpper) || artSpaceless.includes(qSpaceless)) score += 180;

    if (skuUpper.startsWith(qUpper)) score += 220;
    else if (skuUpper.includes(qUpper)) score += 140;

    if (barcodeUpper.endsWith(qUpper) || barcodeUpper.includes(qUpper)) score += 150;
  }

  // 3. Frasa Utuh di Brand / Dept / Deskripsi
  if (deptUpper.includes(qUpper)) score += 140;
  if (brandUpper.includes(qUpper)) score += 120;
  if (descUpper.includes(qUpper)) score += 110;

  if (qSpaceless.length >= 3) {
    if (deptSpaceless.includes(qSpaceless)) score += 110;
    if (brandSpaceless.includes(qSpaceless)) score += 90;
    if (descSpaceless.includes(qSpaceless)) score += 80;
  }

  // 4. Pencocokan Grup Sinonim per Kata (Bilingual & 30% Abbreviation Match)
  let matchedGroups = 0;
  for (const group of expanded.tokenGroups) {
    let groupBest = 0;
    for (const term of group) {
      if (!term) continue;
      if (artUpper === term) groupBest = Math.max(groupBest, 90);
      else if (artUpper.includes(term)) groupBest = Math.max(groupBest, 60);

      if (brandUpper === term || deptUpper === term) groupBest = Math.max(groupBest, 55);
      else if (brandUpper.includes(term) || deptUpper.includes(term)) groupBest = Math.max(groupBest, 45);

      if (colorUpper === term || sizeUpper === term) groupBest = Math.max(groupBest, 50);
      else if (colorUpper.includes(term)) groupBest = Math.max(groupBest, 35);

      if (descUpper.includes(term)) groupBest = Math.max(groupBest, 40);
      if (skuUpper.includes(term) || barcodeUpper.includes(term)) groupBest = Math.max(groupBest, 45);
    }

    if (groupBest > 0) {
      score += groupBest;
      matchedGroups++;
    } else {
      // Cek kemiripan parsial 30% per token terhadap seluruh identitas produk
      const sim = computePartialTextSimilarity(group[0], fullIdentity);
      if (sim >= 0.65) {
        score += Math.round(sim * 30);
        matchedGroups += 0.6;
      }
    }
  }

  // Bonus proporsional kelengkapan kata (bahkan jika hanya 30%-50% kata yang cocok, tetap dapat skor terukur)
  if (expanded.tokenGroups.length > 0) {
    const coverageRatio = matchedGroups / expanded.tokenGroups.length;
    if (coverageRatio >= 0.99 && expanded.tokenGroups.length > 1) {
      score += 95; // Semua kata/niat cocok!
    } else if (coverageRatio >= 0.5) {
      score += Math.round(coverageRatio * 45);
    } else if (coverageRatio >= 0.3) {
      score += Math.round(coverageRatio * 25);
    }
  }

  // 5. Kemiripan Teks Parsial 30% Keseluruhan (Character Bigram & Subsequence)
  const overallSim = computePartialTextSimilarity(expanded.cleaned, fullIdentity);
  if (overallSim >= 0.55) {
    score += Math.round(overallSim * 50);
  }

  // 6. Prioritas Stok Fisik Aktif, Foto Studio, & Kewajaran Harga
  if ((p.stok || 0) > 0) score += 25;
  if (p.imageUrl) score += 12;
  if ((p.hargaNormal || 0) >= 5000) score += 10;

  if (!isSearchingDummy) {
    if (artUpper.includes("DUMMY") || descUpper.includes("DUMMY") || skuUpper.includes("DUMMY")) {
      score -= 1000;
    }
    if ((p.hargaNormal || 0) < 100) {
      score -= 300;
    }
  }

  return score;
}

/**
 * Konsultasi Cepat ke Gemini AI Agent (gemini-flash-lite-latest)
 * Menerjemahkan deskripsi 30%, typo berat, atau bahasa sehari-hari pelanggan
 * menjadi kata kunci katalog ERP Matahari (Brand, Kategori Inggris/Indo, Warna, Artikel).
 */
export async function consultGeminiSearchAgent(rawQuery: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !rawQuery || rawQuery.trim().length < 3) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200); // Maksimal 2.2 detik agar selalu responsif

  try {
    const prompt = `Kamu adalah AI Search Agent untuk database kasir Matahari Department Store (84.763 SKU).
Kasir/pelanggan mengetik pencarian (bisa berupa potongan 30% nama produk, singkatan, typo, atau bahasa sehari-hari):
"${rawQuery}"

Terjemahkan keinginan pengguna tersebut menjadi maksimal 8 kata kunci pencarian database ritel (gabungan istilah Inggris ERP Matahari & Indonesia: nama brand seperti SUKO/NEVADA/COLE/CONNEXION/LITTLE M/ST YVES/ZES/MUKU/VOLO/MAXMURAH/DISNEY, tipe pakaian seperti T-SHIRT/SHIRT/BLOUSE/SWEATER/HOODIE/PANTS/JEANS/SHORT/DRESS/SHOES/SANDAL/SLEEPWEAR/BOXER/SOCK, warna dalam bahasa Inggris seperti BLACK/WHITE/NAVY/RED/PINK/VANILLA/OLIVE/GREY/BEIGE, atau kode artikel).
Balas HANYA dalam format JSON array berisi string huruf kapital, contoh: ["SWEATER", "NEVADA", "BEAR", "LADIES"]`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 120,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => String(x || "").trim().toUpperCase())
        .filter((x) => x.length >= 2 && !STOPWORDS.has(x))
        .slice(0, 8);
    }
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

const INVALID_ARTICLE_SET = new Set(["", "0", "-", "PRODUK BARU", "N/A", "NONE"]);

/** Menandai SKU dummy / tidak digunakan agar tidak pernah masuk hasil katalog */
export function isIgnoredCatalogProduct(p: { description?: string | null; name?: string | null; article?: string | null }): boolean {
  const descUpper = String(p?.description || p?.name || "").trim().toUpperCase();
  const artUpper = String(p?.article || "").trim().toUpperCase();
  return (
    descUpper.includes("SKU DUMMY") ||
    descUpper.includes("ITEM TIDAK DIGUNAKAN") ||
    descUpper.includes("ITEM TIDAK DAPAT") ||
    descUpper.includes("TIDAK DI GUNAKAN") ||
    descUpper.includes("DUMMYZES") ||
    artUpper.includes("DUMMY")
  );
}

/**
 * Kunci pengelompokan unik per artikel:
 * - Untuk artikel valid: isolasi berdasarkan `brandGroup::categoryKey::article` agar kode artikel
 *   yang kebetulan kembar (misal THEA/JULIAN Sandal VOLO vs Cardigan/Sweatshirt ZES) tidak tercampur.
 * - Bila kolom `article` bernilai "0" / "-" / kosong (mis. 3.395 SKU ZES & 204 SKU anak),
 *   kelompokkan berdasarkan nama dasar produk (`brand::dept::baseDesc`).
 */
export function getProductArticleGroupKey(item: {
  article?: string | null;
  description?: string | null;
  name?: string | null;
  brand?: string | null;
  dept?: string | null;
  sku?: string | null;
}): string {
  const rawArt = String(item?.article || "").trim().toUpperCase();
  if (!INVALID_ARTICLE_SET.has(rawArt)) {
    const bGroup = classifyBrandGroup(item);
    const catKey = classifyProductCategory(item);
    return `ART::${bGroup}::${catKey}::${rawArt}`;
  }
  const baseDesc = String(item?.description || item?.name || "").split(":")[0].trim().toUpperCase();
  if (baseDesc.length >= 3) {
    const brandU = String(item?.brand || "").trim().toUpperCase();
    const deptU = String(item?.dept || "").trim().toUpperCase();
    return `DESC::${brandU}::${deptU}::${baseDesc}`;
  }
  return `SKU::${item?.sku || ""}`;
}

function isPromoActiveForProduct(p: any): boolean {
  if (p?.toDate) {
    const t = new Date(p.toDate);
    if (!isNaN(t.getTime())) {
      t.setHours(23, 59, 59, 999);
      if (new Date() > t) return false;
    }
  }
  return Boolean(
    (p?.hargaPromo && Number(p.hargaPromo) > 0 && Number(p.hargaPromo) < Number(p.hargaNormal || 0)) ||
    p?.discountType
  );
}

/**
 * Mengelompokkan daftar SKU hasil pencarian per Kode Artikel (Konsep 3 Catalog Grouping),
 * sehingga tidak ada puluhan baris duplikat untuk size S/M/L/XL dari model yang sama.
 */
export function groupProductsByArticle<T extends Record<string, any>>(items: T[]): Array<
  T & {
    articleGroupCount: number;
    articleTotalStok: number;
    articleColors: string[];
    articleSizes: string[];
    articleHasPromo: boolean;
    articlePromoLabel: string | null;
    brandGroup: ResolvedBrandGroup;
    categoryKey: ResolvedCategoryKey;
  }
> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    if (isIgnoredCatalogProduct(item)) continue;
    const key = getProductArticleGroupKey(item);
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const sizeRank = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL", "5XL", "ALL SIZE", "ALLSIZE"];
  const sortSizes = (a: string, b: string) => {
    const ia = sizeRank.indexOf(a.toUpperCase());
    const ib = sizeRank.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  };

  const result: Array<
    T & {
      articleGroupCount: number;
      articleTotalStok: number;
      articleColors: string[];
      articleSizes: string[];
      articleHasPromo: boolean;
      articlePromoLabel: string | null;
      brandGroup: ResolvedBrandGroup;
      categoryKey: ResolvedCategoryKey;
    }
  > = [];

  for (const variants of groups.values()) {
    // Pilih perwakilan terbaik: utamakan yang ada foto + stok > 0 + promo aktif
    const sorted = [...variants].sort((a, b) => {
      const aImg = a.imageUrl ? 1 : 0;
      const bImg = b.imageUrl ? 1 : 0;
      if (bImg !== aImg) return bImg - aImg;
      const aPromo = isPromoActiveForProduct(a) ? 1 : 0;
      const bPromo = isPromoActiveForProduct(b) ? 1 : 0;
      if (bPromo !== aPromo) return bPromo - aPromo;
      return (Number(b.stok) || 0) - (Number(a.stok) || 0);
    });

    const rep = { ...sorted[0] };
    const bestPhoto = variants.find((v) => v.imageUrl)?.imageUrl || rep.imageUrl || null;
    const promoVariant = variants.find((v) => isPromoActiveForProduct(v));

    const colorSet = new Set<string>();
    const sizeSet = new Set<string>();
    let totalStok = 0;

    for (const v of variants) {
      totalStok += Math.max(0, Number(v.stok) || 0);
      const col = String(v.color || "").trim();
      if (col && !["-", "SOLID"].includes(col.toUpperCase())) colorSet.add(col);
      const sz = String(v.size || "").trim();
      if (sz && !["-", "SOLID"].includes(sz.toUpperCase())) sizeSet.add(sz);
    }

    if (bestPhoto) (rep as any).imageUrl = bestPhoto;
    if (promoVariant) {
      (rep as any).hargaPromo = promoVariant.hargaPromo ?? rep.hargaPromo;
      (rep as any).discountType = promoVariant.discountType ?? rep.discountType;
      (rep as any).diskon = promoVariant.diskon ?? rep.diskon;
      (rep as any).acara = promoVariant.acara ?? rep.acara;
    }

    let promoLabel: string | null = null;
    if (promoVariant) {
      const dt = String(promoVariant.discountType || "").trim();
      const dsk = String(promoVariant.diskon || "").trim();
      if (dt) promoLabel = dt;
      else if (dsk) promoLabel = dsk;
      else if (promoVariant.hargaPromo && promoVariant.hargaNormal > promoVariant.hargaPromo) {
        const pct = Math.round(((promoVariant.hargaNormal - promoVariant.hargaPromo) / promoVariant.hargaNormal) * 100);
        promoLabel = pct >= 5 ? `DISKON ${pct}%` : "PROMO";
      } else {
        promoLabel = "PROMO";
      }
    }

    result.push({
      ...rep,
      articleGroupCount: variants.length,
      articleTotalStok: totalStok,
      articleColors: Array.from(colorSet).sort(),
      articleSizes: Array.from(sizeSet).sort(sortSizes),
      articleHasPromo: Boolean(promoVariant),
      articlePromoLabel: promoLabel,
      brandGroup: classifyBrandGroup(rep),
      categoryKey: classifyProductCategory(rep),
    });
  }

  return result;
}


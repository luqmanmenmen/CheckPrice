import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { checkSingleItemStock, calculateEan13CheckDigit } from "@/lib/mdsBisaClient";
import {
  expandRetailQuery,
  computeProductRelevanceScore,
  consultGeminiSearchAgent,
  groupProductsByArticle,
} from "@/lib/smartSearchEngine";
import {
  BrandGroupKey,
  CategoryKey,
  GenderKey,
  buildBrandPrismaWhere,
  buildCategoryPrismaWhere,
  classifyProductGender,
} from "@/lib/productTaxonomy";
import {
  PRODUCT_LIST_SELECT,
  cleanPromoList,
  checkAndCleanPromo,
  getProductSiblings,
  summarizeTaxonomyCounts,
  filterByTaxonomy,
  buildSubBrandPrismaClause,
  buildTaxonomyListPayload,
  getEstimatedProductCount,
} from "@/lib/productQueryHelpers";

export const dynamic = 'force-dynamic';

/**
 * Bangun filter prefix range B-tree PostgreSQL (`en_US.UTF-8` safe).
 * Menggantikan Prisma `startsWith` (`LIKE 'x%'`) yang memicu 24,5s Sequential Scan
 * saat digabungkan dalam `OR`. Di collation `en_US.UTF-8`, huruf kecil urut sebelum
 * huruf besar dan `:` urut sebelum digit, sehingga rentang `lower..UPPER+\uffff` akurat.
 */
function buildBtreePrefixWhere(field: 'sku' | 'barcode', prefix: string) {
  return {
    AND: [
      { [field]: { gte: prefix.toLowerCase() } },
      { [field]: { lt: `${prefix.toUpperCase()}\uffff` } }
    ]
  };
}

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX_KEYS = 80;
const searchListCache = new Map<
  string,
  {
    groupedArticles: any[];
    totalSkus: number;
    aiAssisted: boolean;
    brandCounts: Record<BrandGroupKey, number>;
    categoryCounts: Record<CategoryKey, number>;
    genderCounts: Record<GenderKey, number>;
    expiresAt: number;
  }
>();

const VALID_BRANDS = new Set<BrandGroupKey>(["ALL", "SUKO", "MUKU", "ZES"]);
const VALID_CATEGORIES = new Set<CategoryKey>([
  "ALL",
  "JAKET",
  "ATASAN",
  "CELANA",
  "SPORT",
  "DRESS_ROK",
  "SEPATU_SANDAL",
  "TAS_AKSESORIS",
  "BEAUTY",
  "TIDUR_DALAM",
  "OTHER",
]);
const VALID_GENDERS = new Set<GenderKey>(["ALL", "MEN", "LADIES", "BOYS", "GIRLS"]);

const SIZE_TOKEN_RE = /^(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|2L|3L|4L|ALL|\d{1,2})$/i;

function getCachedSearchResult(key: string) {
  const hit = searchListCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    searchListCache.delete(key);
    return null;
  }
  return hit;
}

function setCachedSearchResult(
  key: string,
  value: {
    groupedArticles: any[];
    totalSkus: number;
    aiAssisted: boolean;
    brandCounts: Record<BrandGroupKey, number>;
    categoryCounts: Record<CategoryKey, number>;
    genderCounts: Record<GenderKey, number>;
  }
) {
  if (searchListCache.size >= SEARCH_CACHE_MAX_KEYS) {
    const oldestKey = searchListCache.keys().next().value;
    if (oldestKey !== undefined) searchListCache.delete(oldestKey);
  }
  searchListCache.set(key, {
    ...value,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    const rawInput = identifier ? decodeURIComponent(identifier).trim() : "";
    if (!rawInput) {
      return NextResponse.json({ error: "Kata kunci pencarian kosong" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const groupSections = searchParams.get('groupSections') !== '0';
    const onlyPromo = searchParams.get('onlyPromo') === '1';

    const rawBrand = (searchParams.get('brandGroup') || 'ALL').toUpperCase() as BrandGroupKey;
    const rawCategory = (searchParams.get('category') || 'ALL').toUpperCase() as CategoryKey;
    const rawGender = (searchParams.get('gender') || 'ALL').toUpperCase() as GenderKey;
    const subBrand = (searchParams.get('subBrand') || '').trim().toUpperCase();
    const brandGroup: BrandGroupKey = VALID_BRANDS.has(rawBrand) ? rawBrand : 'ALL';
    const category: CategoryKey = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'ALL';
    const gender: GenderKey = VALID_GENDERS.has(rawGender) ? rawGender : 'ALL';
    const hasTaxonomyFilter = brandGroup !== 'ALL' || category !== 'ALL' || Boolean(subBrand) || gender !== 'ALL';

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 1: EXACT & FLEXIBLE CODE MATCH (SKU / Barcode / BarcodeAlias)
    //  Mendukung angka 5-20 digit, kode alfanumerik (TP090-10-02, QH110.CAMEL.38, PCL...), strip pemisah (-/_/.//)
    // ─────────────────────────────────────────────────────────────
    const mayBeCode = (/\d/.test(rawInput) || /[\-._/]/.test(rawInput)) && !/\s/.test(rawInput);
    if (mayBeCode) {
      const upperInput = rawInput.toUpperCase();
      const normNoSep = upperInput.replace(/[\s\-_./]/g, "");
      const candidateCodes = Array.from(new Set([rawInput, upperInput, normNoSep].filter(Boolean)));

      if (/^\d+$/.test(rawInput)) {
        const stripped = rawInput.replace(/^0+/, "");
        if (stripped && stripped !== rawInput) candidateCodes.push(stripped);
        if (rawInput.length === 12) candidateCodes.push(`0${rawInput}`);
        if (rawInput.length === 13 && rawInput.startsWith("0")) candidateCodes.push(rawInput.slice(1));
        if (rawInput.length === 13) {
          const validCd = calculateEan13CheckDigit(rawInput.slice(0, 12));
          if (validCd) candidateCodes.push(rawInput.slice(0, 12) + validCd);
        }
      }

      let directProduct = await db.product.findFirst({
        where: {
          OR: [
            { sku: { in: candidateCodes } },
            { barcode: { in: candidateCodes } },
          ]
        }
      });

      if (!directProduct) {
        const aliasHit = await db.barcodeAlias.findFirst({
          where: {
            OR: [
              { barcode: { in: candidateCodes } },
              { barcodeNorm: { in: candidateCodes } },
            ]
          },
          select: { sku: true }
        });
        if (aliasHit) {
          directProduct = await db.product.findUnique({ where: { sku: aliasHit.sku } });
        }
      }

      if (directProduct) {
        const cleanedProduct = checkAndCleanPromo(directProduct);
        const siblings = await getProductSiblings(cleanedProduct);
        const allFamilySkus = Array.from(new Set([directProduct.sku, ...siblings.map(s => s.sku)].filter(Boolean)));
        const familyAliases: Array<{ barcode: string; barcodeNorm: string; sku: string }> = await db.barcodeAlias.findMany({
          where: { sku: { in: allFamilySkus } },
          select: { barcode: true, barcodeNorm: true, sku: true }
        }).catch(() => [] as Array<{ barcode: string; barcodeNorm: string; sku: string }>);
        if (mayBeCode && !familyAliases.some(a => candidateCodes.includes(a.barcode) || candidateCodes.includes(a.barcodeNorm))) {
          if (rawInput !== directProduct.sku && rawInput !== directProduct.barcode) {
            familyAliases.push({ barcode: rawInput, barcodeNorm: normNoSep, sku: directProduct.sku });
          }
        }
        return NextResponse.json({ data: cleanedProduct, siblings, aliases: familyAliases });
      }
    }

    // JALUR KILAT KODE NUMERIK MURNI (5-20 digit: SKU 7-9 digit, EAN-8, UPC-12, EAN-13, ITF-14+)
    // Serta fallback cepat untuk kode vendor/artikel bila belum ditemukan di DB
    const fastMode = searchParams.get('fast') === '1';
    const isPureDigitCode = /^\d{5,20}$/.test(rawInput);
    const isAlphaVendorCode = !isPureDigitCode && /^(?=.*[\d\-._/])[A-Za-z0-9._\-/]{4,32}$/.test(rawInput);

    // Tahap 1 sudah mengecek exact match sku/barcode/BarcodeAlias (B-tree <5ms).
    // Hanya lakukan prefix search bila panjang digit <= 7 (pencarian potongan SKU),
    // agar barcode 8-20 digit yang tidak ada langsung mengembalikan 404 instan (<15ms)!
    if (isPureDigitCode && rawInput.length <= 7 && !fastMode) {
      const numericMatches = await db.product.findMany({
        where: {
          OR: [
            buildBtreePrefixWhere('sku', rawInput),
            buildBtreePrefixWhere('barcode', rawInput),
            buildBtreePrefixWhere('barcode', `234000${rawInput}`),
          ]
        },
        take: 30
      });
      numericMatches.sort((a, b) => (b.stok ?? 0) - (a.stok ?? 0));

      if (numericMatches.length === 1) {
        const top = checkAndCleanPromo(numericMatches[0]);
        const siblings = await getProductSiblings(top);
        const allFamilySkus = Array.from(new Set([top.sku, ...siblings.map(s => s.sku)].filter(Boolean)));
        const familyAliases = await db.barcodeAlias.findMany({
          where: { sku: { in: allFamilySkus } },
          select: { barcode: true, barcodeNorm: true, sku: true }
        }).catch(() => []);
        return NextResponse.json({ data: top, siblings, aliases: familyAliases });
      }
      if (numericMatches.length > 1) {
        const cleaned = cleanPromoList(numericMatches);
        return NextResponse.json({
          data: cleaned,
          meta: { page: 1, limit: 20, total: cleaned.length, totalSkus: cleaned.length, totalPages: 1 }
        });
      }
    }

    // Jika scan barcode/SKU numerik MAUPUN QR/Barcode alfanumerik unik (mis. 2663005FS) tidak ada di DB Turso,
    // OTOMATIS langsung tembak live server (Mu+Ku + SUKO) & simpan permanen ke Product + BarcodeAlias!
    const isLikelyUniqueQrOrVendorCode =
      isAlphaVendorCode && rawInput.length >= 6 && /\d{3,}/.test(rawInput);
    const allowLiveFallback = isPureDigitCode || isLikelyUniqueQrOrVendorCode || searchParams.get('live') === '1';

    if (isPureDigitCode || isAlphaVendorCode) {
      if (allowLiveFallback) {
        // Untuk kode alfanumerik (mis. PSNYC01), jangan skip ke live MDS jika artikel DB sudah ada
        const hasDbArticleMatch = isAlphaVendorCode
          ? await db.product.findFirst({
              where: { article: { contains: rawInput } },
              select: { sku: true }
            })
          : null;

        if (!hasDbArticleMatch) {
          try {
            const liveTimeoutMs = isPureDigitCode ? 12000 : 9500;
            const liveRes: any = await Promise.race([
              checkSingleItemStock(rawInput, {
                discoverFamily: true,
                withImages: true,
                syncAllSizes: true,
                // QR / barcode alfanumerik unik (mis. 2663005FS) mayoritas milik Mu+Ku / konsinyasi -> coba Mu+Ku dulu (otomatis fallback SUKO!)
                ...(isLikelyUniqueQrOrVendorCode ? { preferredAccount: 'muku' as const } : {}),
              }),
              new Promise((resolve) => setTimeout(() => resolve({ success: false, timeout: true }), liveTimeoutMs))
            ]);
            if (liveRes?.success && liveRes?.data) {
              return NextResponse.json({
                data: liveRes.data,
                siblings: liveRes.siblings || [liveRes.data],
                aliases: liveRes.aliases || [],
                ownerAccount: liveRes.ownerAccount || null,
                source: 'MDS_BISA_LIVE'
              });
            }
            if (liveRes?.success && liveRes?.sku) {
              let fetched = await db.product.findFirst({
                where: {
                  OR: [
                    { sku: liveRes.sku },
                    ...(liveRes.barcode ? [{ barcode: liveRes.barcode }] : []),
                    { barcode: rawInput }
                  ]
                }
              });
              if (fetched) {
                fetched = checkAndCleanPromo(fetched);
                const siblings = await getProductSiblings(fetched);
                return NextResponse.json({ data: fetched, siblings, source: 'MDS_BISA_LIVE' });
              }
            }
          } catch {}
        }
      }

      if (isPureDigitCode || fastMode) {
        return NextResponse.json(
          {
            error: `Produk tidak ditemukan untuk: "${rawInput}"`,
            hint: "Ketuk tombol Scrap luqman org di bawah untuk menarik SKU, barcode, dan foto secara langsung."
          },
          { status: 404 }
        );
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  CACHE KILAT HALAMAN (Page 2 / Sebelumnya / Ulangi Kata = 1ms!)
    // ─────────────────────────────────────────────────────────────
    const cacheKey = `${rawInput.toLowerCase()}::b=${brandGroup}::s=${subBrand}::c=${category}::gn=${gender}`;
    const cachedList = getCachedSearchResult(cacheKey);
    if (cachedList) {
      const total = cachedList.groupedArticles.length;
      if (total === 1 && page === 1 && !hasTaxonomyFilter && !onlyPromo) {
        const topProduct = cachedList.groupedArticles[0];
        const siblings = await getProductSiblings(topProduct);
        const allFamilySkus = Array.from(new Set([topProduct.sku, ...siblings.map(s => s.sku)].filter(Boolean)));
        const familyAliases = await db.barcodeAlias.findMany({
          where: { sku: { in: allFamilySkus } },
          select: { barcode: true, barcodeNorm: true, sku: true }
        }).catch(() => []);
        return NextResponse.json({ data: topProduct, siblings, aliases: familyAliases, aiAssisted: cachedList.aiAssisted });
      }
      const payload = buildTaxonomyListPayload({
        groupedList: cachedList.groupedArticles,
        totalSkus: cachedList.totalSkus,
        brandGroup,
        category,
        subBrand,
        gender,
        page,
        limit,
        groupSections,
        isBrowseMode: false,
        brandCounts: cachedList.brandCounts,
        categoryCounts: cachedList.categoryCounts,
        genderCounts: cachedList.genderCounts,
        onlyPromo,
      });
      return NextResponse.json({
        data: payload.data,
        aiAssisted: cachedList.aiAssisted,
        meta: {
          ...payload.meta,
          cached: true,
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2: EKSPANSI PINTAR (30% PARTIAL TEXT + SINONIM KASIR)
    //  Hanya menyentuh kolom terindeks GIN pg_trgm agar eksekusi SQL ~50-150ms!
    // ─────────────────────────────────────────────────────────────
    const isSearchingDummy = rawInput.toLowerCase().includes("dummy");
    const expanded = expandRetailQuery(rawInput);
    const extraAndFilters: any[] = [];
    if (!isSearchingDummy) {
      extraAndFilters.push({
        NOT: [
          { article: { contains: "DUMMY" } },
          { description: { contains: "SKU DUMMY" } },
          { description: { contains: "ITEM TIDAK DIGUNAKAN" } },
          { description: { contains: "ITEM TIDAK DAPAT" } },
          { description: { contains: "TIDAK DI GUNAKAN" } }
        ]
      });
    }
    const brandWhere = buildBrandPrismaWhere(brandGroup);
    if (brandWhere) extraAndFilters.push(brandWhere);
    const subWhere = buildSubBrandPrismaClause(subBrand);
    if (subWhere) extraAndFilters.push(subWhere);
    const categoryWhere = buildCategoryPrismaWhere(category);
    if (categoryWhere) extraAndFilters.push(categoryWhere);

    const buildTermOrClause = (term: string) => {
      const clauses: any[] = [
        { description: { contains: term } },
        { article: { contains: term } },
      ];
      if (/\d/.test(term)) {
        clauses.push(
          buildBtreePrefixWhere('sku', term),
          buildBtreePrefixWhere('barcode', term)
        );
      }
      return clauses;
    };

    const tokenGroupAndConditions = expanded.tokenGroups.map(group => ({
      OR: group.flatMap(term => buildTermOrClause(term))
    }));

    // Tambahkan kondisi frasa utuh hanya jika multi-kata / punya bentuk tanpa spasi unik
    const firstGroupHasRaw =
      expanded.tokenGroups.length === 1 &&
      expanded.tokenGroups[0].includes(rawInput.toUpperCase());

    const strictOrBranches: any[] = [{ AND: tokenGroupAndConditions }];
    if (!firstGroupHasRaw) {
      strictOrBranches.unshift({ OR: buildTermOrClause(rawInput) });
    }
    if (expanded.spaceless.length >= 3 && expanded.spaceless !== rawInput.toUpperCase()) {
      strictOrBranches.push({
        OR: [
          { article: { contains: expanded.spaceless } },
          { description: { contains: expanded.spaceless } }
        ]
      });
    }

    const strictWhere: any =
      strictOrBranches.length === 1 ? strictOrBranches[0] : { OR: strictOrBranches };
    if (extraAndFilters.length > 0) {
      strictWhere.AND = [...(strictWhere.AND || []), ...extraAndFilters];
    }

    const candidateMap = new Map<string, any>();

    const strictMatches = await db.product.findMany({
      where: strictWhere,
      select: PRODUCT_LIST_SELECT,
      take: 240
    });
    for (const p of strictMatches) candidateMap.set(p.sku, p);

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2B: RELAXED 30% PARTIAL TEXT FALLBACK
    // ─────────────────────────────────────────────────────────────
    if (candidateMap.size < 25 && expanded.allExpandedTerms.length > 0) {
      const meaningfulTerms = expanded.allExpandedTerms.filter(t => t.length >= 3).slice(0, 12);
      if (meaningfulTerms.length > 0) {
        const relaxedWhere: any = {
          OR: meaningfulTerms.flatMap(term => [
            { description: { contains: term } },
            { article: { contains: term } },
          ])
        };
        if (extraAndFilters.length > 0) relaxedWhere.AND = extraAndFilters;

        const relaxedMatches = await db.product.findMany({
          where: relaxedWhere,
          select: PRODUCT_LIST_SELECT,
          take: 140
        });
        for (const p of relaxedMatches) {
          if (!candidateMap.has(p.sku)) candidateMap.set(p.sku, p);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 3: GEMINI AI RETAIL SEARCH AGENT
    // ─────────────────────────────────────────────────────────────
    let aiExpandedTerms: string[] = [];
    if (candidateMap.size < 5 && !/^\d+$/.test(rawInput) && rawInput.length >= 3) {
      aiExpandedTerms = await consultGeminiSearchAgent(rawInput);
      if (aiExpandedTerms.length > 0) {
        expanded.tokenGroups.push(aiExpandedTerms);
        for (const t of aiExpandedTerms) {
          if (!expanded.allExpandedTerms.includes(t)) expanded.allExpandedTerms.push(t);
        }

        const aiWhere: any = {
          OR: aiExpandedTerms.flatMap(term => [
            { description: { contains: term } },
            { article: { contains: term } },
          ])
        };
        if (extraAndFilters.length > 0) aiWhere.AND = extraAndFilters;

        const aiMatches = await db.product.findMany({
          where: aiWhere,
          select: PRODUCT_LIST_SELECT,
          take: 100
        });
        for (const p of aiMatches) {
          if (!candidateMap.has(p.sku)) candidateMap.set(p.sku, p);
        }
      }
    }

    const candidateMatches = Array.from(candidateMap.values());

    if (candidateMatches.length === 0) {
      const totalCount = await getEstimatedProductCount();
      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${rawInput}"`,
          hint: `Total produk di database: ${totalCount.toLocaleString('id-ID')} SKU. Coba ketik sebagian nama produk (30% teks), kode artikel, SKU, atau scan barcode.`
        },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 4: BOBOT RELEVANSI CERDAS & PENGELOMPOKAN ARTIKEL
    // ─────────────────────────────────────────────────────────────
    const scoredProducts = candidateMatches.map(p => ({
      product: p,
      score: computeProductRelevanceScore(p, expanded, isSearchingDummy)
    }));

    scoredProducts.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.product.stok !== a.product.stok) return b.product.stok - a.product.stok;
      return (a.product.description || "").localeCompare(b.product.description || "");
    });

    const rankedProducts = cleanPromoList(scoredProducts.map(sp => sp.product));
    const baseScopedProducts = filterByTaxonomy(rankedProducts, brandGroup, category, subBrand, "ALL");
    const groupedBase = groupProductsByArticle(baseScopedProducts);
    const { brandCounts, categoryCounts, genderCounts } = summarizeTaxonomyCounts(groupedBase);
    const groupedArticles =
      gender === "ALL"
        ? groupedBase
        : groupedBase.filter((item) => classifyProductGender(item) === gender);
    const totalSkusFiltered = groupedArticles.reduce((sum, item) => sum + (item.articleGroupCount || 1), 0);

    // Simpan ke cache server 60s agar klik Selanjutnya/Sebelumnya = 1ms!
    setCachedSearchResult(cacheKey, {
      groupedArticles,
      totalSkus: totalSkusFiltered,
      aiAssisted: aiExpandedTerms.length > 0,
      brandCounts,
      categoryCounts,
      genderCounts,
    });

    if (groupedArticles.length === 1 && page === 1 && !hasTaxonomyFilter && !onlyPromo) {
      const topProduct = groupedArticles[0];
      const siblings = await getProductSiblings(topProduct);
      const allFamilySkus = Array.from(new Set([topProduct.sku, ...siblings.map(s => s.sku)].filter(Boolean)));
      const familyAliases = await db.barcodeAlias.findMany({
        where: { sku: { in: allFamilySkus } },
        select: { barcode: true, barcodeNorm: true, sku: true }
      }).catch(() => []);
      return NextResponse.json({ data: topProduct, siblings, aliases: familyAliases, aiAssisted: aiExpandedTerms.length > 0 });
    }

    const payload = buildTaxonomyListPayload({
      groupedList: groupedArticles,
      totalSkus: totalSkusFiltered,
      brandGroup,
      category,
      subBrand,
      gender,
      page,
      limit,
      groupSections,
      isBrowseMode: false,
      brandCounts,
      categoryCounts,
      genderCounts,
      onlyPromo,
    });

    return NextResponse.json({
      data: payload.data,
      aiAssisted: aiExpandedTerms.length > 0,
      meta: payload.meta,
    });

  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal: " + String(error) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";
import { checkSingleItemStock } from "@/lib/mdsBisaClient";
import {
  expandRetailQuery,
  computeProductRelevanceScore,
  consultGeminiSearchAgent,
} from "@/lib/smartSearchEngine";

export const dynamic = 'force-dynamic';

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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    // Helper to auto-remove promo if expired (in-memory clean + asynchronous background DB update)
    const checkAndCleanPromo = (p: any) => {
      if (p && p.toDate) {
        const toDateObj = new Date(p.toDate);
        if (!isNaN(toDateObj.getTime())) {
          toDateObj.setHours(23, 59, 59, 999);
          if (new Date() > toDateObj) {
            p.hargaPromo = null;
            p.diskon = null;
            p.discountType = null;
            p.acara = null;
            p.fromDate = null;
            p.toDate = null;

            db.product.update({
              where: { id: p.id },
              data: {
                hargaPromo: null,
                diskon: null,
                discountType: null,
                acara: null,
                fromDate: null,
                toDate: null
              }
            }).catch(e => console.error("Auto-clean promo background error:", e));
          }
        }
      }
      return p;
    };

    // Helper untuk mengambil seluruh varian (siblings) produk berdasarkan article
    const getProductSiblings = async (prod: any) => {
      let siblings: any[] = [];
      if (prod.article && prod.article.trim() && !["0", "-", "PRODUK BARU"].includes(prod.article.trim().toUpperCase())) {
        const allSiblings = await db.product.findMany({
          where: { article: prod.article },
          orderBy: [{ color: 'asc' }, { size: 'asc' }, { description: 'asc' }]
        });
        siblings = allSiblings.map(checkAndCleanPromo);
      } else if (prod.description) {
        const parts = prod.description.split(":");
        if (parts.length > 1) {
          const parentName = parts[0].trim();
          const allSiblings = await db.product.findMany({
            where: { description: { startsWith: parentName + ":" } },
            orderBy: { description: 'asc' }
          });
          siblings = allSiblings.map(checkAndCleanPromo);
        }
      }
      return siblings;
    };

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 1: EXACT MATCH PRIORITAS (SKU & BARCODE)
    // ─────────────────────────────────────────────────────────────
    let directProduct = await db.product.findFirst({ where: { sku: rawInput } });
    if (!directProduct) {
      directProduct = await db.product.findFirst({ where: { barcode: rawInput } });
    }
    if (!directProduct && /^\d+$/.test(rawInput)) {
      const stripped = rawInput.replace(/^0+/, "");
      if (stripped && stripped !== rawInput) {
        directProduct = await db.product.findFirst({
          where: { OR: [{ barcode: stripped }, { sku: stripped }] }
        });
      }
    }

    if (directProduct) {
      directProduct = checkAndCleanPromo(directProduct);
      const siblings = await getProductSiblings(directProduct);
      return NextResponse.json({ data: directProduct, siblings });
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2: EKSPANSI PINTAR (30% PARTIAL TEXT + SINONIM KASIR)
    // ─────────────────────────────────────────────────────────────
    const isSearchingDummy = rawInput.toLowerCase().includes("dummy");
    const expanded = expandRetailQuery(rawInput);
    const dummyFilter = !isSearchingDummy
      ? {
          NOT: [
            { article: { contains: "DUMMY", mode: 'insensitive' as const } },
            { description: { contains: "SKU DUMMY", mode: 'insensitive' as const } },
            { sku: { contains: "DUMMY", mode: 'insensitive' as const } }
          ]
        }
      : undefined;

    const buildTermOrClause = (term: string) => [
      { article: { contains: term, mode: 'insensitive' as const } },
      { description: { contains: term, mode: 'insensitive' as const } },
      { brand: { contains: term, mode: 'insensitive' as const } },
      { dept: { contains: term, mode: 'insensitive' as const } },
      { color: { contains: term, mode: 'insensitive' as const } },
      { size: { contains: term, mode: 'insensitive' as const } },
      { sku: { contains: term, mode: 'insensitive' as const } },
      { barcode: { contains: term, mode: 'insensitive' as const } }
    ];

    // 1. Pencocokan Frasa Utuh atau Spaceless
    const phraseConditions = buildTermOrClause(rawInput);
    if (expanded.spaceless.length >= 3 && expanded.spaceless !== rawInput.toUpperCase()) {
      phraseConditions.push(
        { article: { contains: expanded.spaceless, mode: 'insensitive' as const } },
        { description: { contains: expanded.spaceless, mode: 'insensitive' as const } },
        { brand: { contains: expanded.spaceless, mode: 'insensitive' as const } },
        { dept: { contains: expanded.spaceless, mode: 'insensitive' as const } }
      );
    }

    // 2. Pencocokan Grup Sinonim per Kata (misal "kaos suko vnl" -> (KAOS|T-SHIRT|TEE) AND (SUKO) AND (VANILLA|VNL))
    const tokenGroupAndConditions = expanded.tokenGroups.map(group => ({
      OR: group.flatMap(term => buildTermOrClause(term))
    }));

    const strictWhere: any = {
      OR: [
        { OR: phraseConditions },
        { AND: tokenGroupAndConditions }
      ]
    };
    if (dummyFilter) strictWhere.AND = [dummyFilter];

    const candidateMap = new Map<string, any>();

    const strictMatches = await db.product.findMany({
      where: strictWhere,
      orderBy: [{ stok: 'desc' }],
      take: 140
    });
    for (const p of strictMatches) candidateMap.set(p.sku, p);

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2B: RELAXED 30% PARTIAL TEXT FALLBACK
    //  Jika hasil strict < 15 (misal user hanya ketik 30% nama deskripsi atau ada kata yang meleset),
    //  tarik kandidat menggunakan Relaxed OR lintas sinonim & potongan kata >= 3 huruf!
    // ─────────────────────────────────────────────────────────────
    if (candidateMap.size < 15 && expanded.allExpandedTerms.length > 0) {
      const meaningfulTerms = expanded.allExpandedTerms.filter(t => t.length >= 3).slice(0, 14);
      if (meaningfulTerms.length > 0) {
        const relaxedWhere: any = {
          OR: meaningfulTerms.flatMap(term => [
            { article: { contains: term, mode: 'insensitive' as const } },
            { description: { contains: term, mode: 'insensitive' as const } },
            { brand: { contains: term, mode: 'insensitive' as const } },
            { dept: { contains: term, mode: 'insensitive' as const } },
            { color: { contains: term, mode: 'insensitive' as const } }
          ])
        };
        if (dummyFilter) relaxedWhere.AND = [dummyFilter];

        const relaxedMatches = await db.product.findMany({
          where: relaxedWhere,
          orderBy: [{ stok: 'desc' }],
          take: 120
        });
        for (const p of relaxedMatches) {
          if (!candidateMap.has(p.sku)) candidateMap.set(p.sku, p);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 3: GEMINI AI RETAIL SEARCH AGENT
    //  Jika kandidat masih sedikit (< 5) atau query berupa kalimat deskriptif / singkatan 30% yang unik,
    //  minta bantuan Gemini AI Agent untuk menerjemahkan keinginan user ke kata kunci ERP!
    // ─────────────────────────────────────────────────────────────
    let aiExpandedTerms: string[] = [];
    if (candidateMap.size < 5 && !/^\d+$/.test(rawInput) && rawInput.length >= 3) {
      aiExpandedTerms = await consultGeminiSearchAgent(rawInput);
      if (aiExpandedTerms.length > 0) {
        // Tambahkan hasil terjemahan AI ke grup sinonim agar ikut dinilai di scoring
        expanded.tokenGroups.push(aiExpandedTerms);
        for (const t of aiExpandedTerms) {
          if (!expanded.allExpandedTerms.includes(t)) expanded.allExpandedTerms.push(t);
        }

        // Cari terlebih dahulu produk yang cocok dengan mayoritas kata kunci AI (AND / Relaxed OR)
        const aiWhere: any = {
          OR: aiExpandedTerms.flatMap(term => [
            { article: { contains: term, mode: 'insensitive' as const } },
            { description: { contains: term, mode: 'insensitive' as const } },
            { brand: { contains: term, mode: 'insensitive' as const } },
            { dept: { contains: term, mode: 'insensitive' as const } },
            { color: { contains: term, mode: 'insensitive' as const } }
          ])
        };
        if (dummyFilter) aiWhere.AND = [dummyFilter];

        const aiMatches = await db.product.findMany({
          where: aiWhere,
          orderBy: [{ stok: 'desc' }],
          take: 120
        });
        for (const p of aiMatches) {
          if (!candidateMap.has(p.sku)) candidateMap.set(p.sku, p);
        }
      }
    }

    const candidateMatches = Array.from(candidateMap.values());

    if (candidateMatches.length === 0) {
      // Self-Healing On-the-Fly: Jika input berupa Barcode (12-14 digit) atau SKU (8 digit),
      // tembak langsung MDS BISA StoreHub jika toko sedang buka
      if (/^\d{8,14}$/.test(rawInput)) {
        try {
          const liveRes = await checkSingleItemStock(rawInput);
          if (liveRes.success && liveRes.sku) {
            let fetched = await db.product.findUnique({ where: { sku: liveRes.sku } });
            if (fetched) {
              fetched = checkAndCleanPromo(fetched);
              const siblings = await getProductSiblings(fetched);
              return NextResponse.json({ data: fetched, siblings, source: 'MDS_BISA_LIVE' });
            }
          }
        } catch (e) {
          console.warn("Gagal lookup live MDS BISA fallback:", e);
        }
      }

      const totalCount = await db.product.count();
      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${rawInput}"`,
          hint: `Total produk di database: ${totalCount.toLocaleString('id-ID')} SKU. Coba ketik sebagian nama produk (30% teks), kode artikel, SKU, atau scan barcode.`
        },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 4: BOBOT RELEVANSI CERDAS (30% FUZZY & SUBSEQUENCE RANKING)
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

    const rankedProducts = scoredProducts.map(sp => sp.product);

    // Jika hanya 1 hasil di halaman 1, tampilkan langsung kartu detailnya beserta seluruh varian
    if (rankedProducts.length === 1 && page === 1) {
      const topProduct = checkAndCleanPromo(rankedProducts[0]);
      const siblings = await getProductSiblings(topProduct);
      return NextResponse.json({ data: topProduct, siblings, aiAssisted: aiExpandedTerms.length > 0 });
    }

    // Jika banyak hasil: Kembalikan daftar berpaginasi
    const total = rankedProducts.length;
    const pagedMatches = rankedProducts.slice(skip, skip + limit);
    const cleanedMatches = pagedMatches.map(checkAndCleanPromo);

    return NextResponse.json({
      data: cleanedMatches,
      aiAssisted: aiExpandedTerms.length > 0,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal: " + String(error) },
      { status: 500 }
    );
  }
}

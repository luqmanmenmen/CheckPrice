import { NextRequest, NextResponse } from "next/server";
import { prisma as db } from "@/lib/prisma";

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
            // Bersihkan di memori langsung agar respons JSON super cepat
            p.hargaPromo = null;
            p.diskon = null;
            p.discountType = null;
            p.acara = null;
            p.fromDate = null;
            p.toDate = null;

            // Update database secara background tanpa memblokir respons user
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
      if (prod.article && prod.article.trim()) {
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

    if (directProduct) {
      directProduct = checkAndCleanPromo(directProduct);
      const siblings = await getProductSiblings(directProduct);
      return NextResponse.json({ data: directProduct, siblings });
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 2: CERDAS BY ARTIKEL & MULTI-KATA (SMART SEARCH)
    // ─────────────────────────────────────────────────────────────
    const isSearchingDummy = rawInput.toLowerCase().includes("dummy");
    const spacelessQuery = rawInput.replace(/[\s\-_]+/g, "");
    const searchTerms = rawInput.split(/[\s\-_]+/).filter(t => t.length > 0);

    // Kriteria pencarian Prisma
    // 1. Pencocokan frasa penuh atau spaceless pada 4 Cell Utama:
    //    Cell 1 (PARENT_NAME / article), Cell 2 (ITEM_DESCRIPTION / description),
    //    Cell 3 (GROUP / brand), Cell 4 (DEPARTMENT / dept), plus SKU & Barcode.
    const phraseConditions = [
      { article: { contains: rawInput, mode: 'insensitive' as const } },
      { description: { contains: rawInput, mode: 'insensitive' as const } },
      { brand: { contains: rawInput, mode: 'insensitive' as const } },
      { dept: { contains: rawInput, mode: 'insensitive' as const } },
      { sku: { contains: rawInput, mode: 'insensitive' as const } },
      { barcode: { contains: rawInput, mode: 'insensitive' as const } }
    ];

    if (spacelessQuery.length >= 3 && spacelessQuery !== rawInput) {
      phraseConditions.push(
        { article: { contains: spacelessQuery, mode: 'insensitive' as const } },
        { description: { contains: spacelessQuery, mode: 'insensitive' as const } },
        { brand: { contains: spacelessQuery, mode: 'insensitive' as const } },
        { dept: { contains: spacelessQuery, mode: 'insensitive' as const } }
      );
    }

    // 2. Pencocokan setiap kata token di seluruh atribut (Artikel, Deskripsi, Brand, Dept, Warna, Ukuran)
    const tokenAndConditions = searchTerms.map(term => ({
      OR: [
        { article: { contains: term, mode: 'insensitive' as const } },
        { description: { contains: term, mode: 'insensitive' as const } },
        { brand: { contains: term, mode: 'insensitive' as const } },
        { dept: { contains: term, mode: 'insensitive' as const } },
        { color: { contains: term, mode: 'insensitive' as const } },
        { size: { contains: term, mode: 'insensitive' as const } },
        { sku: { contains: term, mode: 'insensitive' as const } },
        { barcode: { contains: term, mode: 'insensitive' as const } }
      ]
    }));

    // Gabungkan: Produk cocok jika memenuhi salah satu frasa UTUH ATAU memenuhi SEMUA token kata
    const combinedWhere: any = {
      OR: [
        { OR: phraseConditions },
        { AND: tokenAndConditions }
      ]
    };

    // Filter produk dummy kecuali user memang sengaja mencari kata 'dummy'
    if (!isSearchingDummy) {
      combinedWhere.AND = [
        {
          NOT: [
            { article: { contains: "DUMMY", mode: 'insensitive' as const } },
            { description: { contains: "SKU DUMMY", mode: 'insensitive' as const } },
            { sku: { contains: "DUMMY", mode: 'insensitive' as const } }
          ]
        }
      ];
    }

    // Ambil kandidat produk
    const candidateMatches = await db.product.findMany({
      where: combinedWhere,
      take: 120 // Ambil sampel cukup untuk relevance scoring
    });

    if (candidateMatches.length === 0) {
      const totalCount = await db.product.count();
      return NextResponse.json(
        {
          error: `Produk tidak ditemukan untuk: "${rawInput}"`,
          hint: `Total produk di database: ${totalCount}. Coba gunakan sebagian nama artikel, departemen, merk, atau scan barcode.`
        },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    //  TAHAP 3: BOBOT RELEVANSI CERDAS (INTELLIGENT RELEVANCE RANKING)
    // ─────────────────────────────────────────────────────────────
    const qUpper = rawInput.toUpperCase();
    const qSpacelessUpper = spacelessQuery.toUpperCase();

    const scoredProducts = candidateMatches.map(p => {
      let score = 0;
      const artUpper = (p.article || "").toUpperCase();
      const descUpper = (p.description || "").toUpperCase();
      const brandUpper = (p.brand || "").toUpperCase();
      const deptUpper = (p.dept || "").toUpperCase();
      const skuUpper = (p.sku || "").toUpperCase();
      const barcodeUpper = (p.barcode || "").toUpperCase();
      const colorUpper = (p.color || "").toUpperCase();

      const artSpaceless = artUpper.replace(/[\s\-_]+/g, "");
      const descSpaceless = descUpper.replace(/[\s\-_]+/g, "");
      const brandSpaceless = brandUpper.replace(/[\s\-_]+/g, "");
      const deptSpaceless = deptUpper.replace(/[\s\-_]+/g, "");

      // 1. Exact Match pada salah satu dari 4 Cell Utama (Article / Dept / Brand / Desc)
      if (artUpper === qUpper) score += 300;
      else if (deptUpper === qUpper) score += 280;
      else if (brandUpper === qUpper) score += 260;
      else if (descUpper === qUpper) score += 250;
      else if (artSpaceless === qSpacelessUpper) score += 240;
      else if (deptSpaceless === qSpacelessUpper) score += 230;

      // 2. Exact SKU / Barcode Match
      if (skuUpper === qUpper || barcodeUpper === qUpper) score += 280;

      // 3. Dimulai Dengan Query
      if (artUpper.startsWith(qUpper)) score += 180;
      if (deptUpper.startsWith(qUpper)) score += 150;
      if (brandUpper.startsWith(qUpper)) score += 130;
      if (descUpper.startsWith(qUpper)) score += 120;

      // 4. Frasa query utuh terkandung di 4 Cell Utama
      if (artUpper.includes(qUpper)) score += 140;
      if (deptUpper.includes(qUpper)) score += 130;
      if (brandUpper.includes(qUpper)) score += 100;
      if (descUpper.includes(qUpper)) score += 70;

      // 5. Spaceless match (contoh: 'na young' cocok dengan 'NAYOUNG' atau 'NA-YOUNG')
      if (qSpacelessUpper.length >= 3) {
        if (artSpaceless.includes(qSpacelessUpper)) score += 130;
        if (deptSpaceless.includes(qSpacelessUpper)) score += 120;
        if (brandSpaceless.includes(qSpacelessUpper)) score += 90;
        if (descSpaceless.includes(qSpacelessUpper)) score += 60;
      }

      // 6. Evaluasi kecocokan token kata individu di seluruh 4 cell
      let matchedTokens = 0;
      for (const t of searchTerms) {
        const tU = t.toUpperCase();
        let tokenFound = false;
        if (artUpper.includes(tU)) { score += 25; tokenFound = true; }
        if (deptUpper.includes(tU)) { score += 25; tokenFound = true; }
        if (brandUpper.includes(tU)) { score += 20; tokenFound = true; }
        if (descUpper.includes(tU)) { score += 15; tokenFound = true; }
        if (colorUpper.includes(tU)) { score += 15; tokenFound = true; }
        if (tokenFound) matchedTokens++;
      }
      if (matchedTokens === searchTerms.length && searchTerms.length > 1) {
        score += 40; // Bonus kelengkapan semua kata
      }

      // 7. Bonus ketersediaan stok fisik toko
      if (p.stok > 0) score += 20;

      // 8. Bonus kewajaran harga ritel (> Rp 5.000)
      if (p.hargaNormal >= 5000) score += 15;

      // 9. Penalti data dummy / harga tidak wajar jika tidak dicari
      if (!isSearchingDummy) {
        if (artUpper.includes("DUMMY") || descUpper.includes("DUMMY") || skuUpper.includes("DUMMY")) {
          score -= 1000;
        }
        if (p.hargaNormal < 100) {
          score -= 300;
        }
      }

      return { product: p, score };
    });

    // Urutkan kandidat: Skor tertinggi -> Stok terbanyak -> Abjad nama
    scoredProducts.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.product.stok !== a.product.stok) return b.product.stok - a.product.stok;
      return a.product.description.localeCompare(b.product.description);
    });

    const rankedProducts = scoredProducts.map(sp => sp.product);

    // Jika hanya 1 hasil atau skor produk teratas sangat dominan (exact match) dan halaman 1
    if (rankedProducts.length === 1 && page === 1) {
      const topProduct = await checkAndCleanPromo(rankedProducts[0]);
      const siblings = await getProductSiblings(topProduct);
      return NextResponse.json({ data: topProduct, siblings });
    }

    // Jika banyak hasil: Kembalikan daftar berpaginasi
    const total = rankedProducts.length;
    const pagedMatches = rankedProducts.slice(skip, skip + limit);
    const cleanedMatches = await Promise.all(pagedMatches.map(checkAndCleanPromo));

    return NextResponse.json({
      data: cleanedMatches,
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

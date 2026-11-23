import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isJunkRetailImageUrl, optimizeRetailImageUrl } from "@/lib/imageController";

export const dynamic = "force-dynamic";

// Ukuran file persis logo Matahari abu-abu di Shopify CDN (281×363 px)
const KNOWN_GREY_LOGO_BYTE_SIZES = new Set([2238, 3163]);
const MAX_JUNK_IMAGE_BYTES = 3600;

/**
 * POST /api/product/purge-junk-image
 * Endpoint mandiri Image Quality Controller:
 * Memverifikasi URL gambar sampah (logo Matahari abu-abu 2.238 / 3.163 bytes atau pola placeholder)
 * lewat HTTP HEAD cepat, lalu langsung membersihkan URL tersebut dari `Product` & `CatalogArticle` di Turso Cloud.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
    const optUrl = optimizeRetailImageUrl(rawUrl);
    if (!optUrl || !optUrl.includes("cdn.shopify.com/s/files/1/0666/9212/0727/")) {
      return NextResponse.json({ success: false, skipped: true, reason: "invalid_url" });
    }

    let confirmedJunk = isJunkRetailImageUrl(optUrl);
    let detectedBytes = 0;

    if (!confirmedJunk) {
      try {
        const headRes = await fetch(optUrl, {
          method: "HEAD",
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(4500),
        });
        if (headRes.status === 404 || headRes.status === 410) {
          confirmedJunk = true;
        } else if (headRes.ok) {
          detectedBytes = Number(headRes.headers.get("content-length") || 0);
          if (
            KNOWN_GREY_LOGO_BYTE_SIZES.has(detectedBytes) ||
            (detectedBytes > 0 && detectedBytes <= MAX_JUNK_IMAGE_BYTES)
          ) {
            confirmedJunk = true;
          }
        }
      } catch {
        return NextResponse.json({ success: false, skipped: true, reason: "head_unreachable" });
      }
    }

    if (!confirmedJunk) {
      return NextResponse.json({ success: true, purged: false, reason: "verified_real_image", bytes: detectedBytes });
    }

    const baseUrl = optUrl.split("?")[0];
    const nowTs = new Date();

    // Cari produk yang memakai URL sampah ini (biasanya 1-10 baris)
    const affectedProducts = await prisma.product.findMany({
      where: {
        OR: [{ imageUrl: optUrl }, { imageUrl: { startsWith: baseUrl } }],
      },
      select: { id: true, sku: true, imageUrl: true, images: true },
      take: 100,
    });

    let productsCleaned = 0;
    for (const p of affectedProducts) {
      const rawImgs = Array.isArray(p.images) ? p.images : [];
      const keptImgs = rawImgs.filter(
        (u) => typeof u === "string" && !u.startsWith(baseUrl) && !isJunkRetailImageUrl(u)
      );
      const nextPrimary = keptImgs[0] || null;
      await prisma.product.update({
        where: { id: p.id },
        data: {
          imageUrl: nextPrimary,
          images: JSON.stringify(keptImgs),
          updatedAt: nowTs,
        },
      });
      productsCleaned++;
    }

    const catRes = await prisma.catalogArticle.updateMany({
      where: {
        OR: [{ imageUrl: optUrl }, { imageUrl: { startsWith: baseUrl } }],
      },
      data: { imageUrl: null, updatedAt: nowTs },
    });

    return NextResponse.json({
      success: true,
      purged: true,
      bytes: detectedBytes,
      productsCleaned,
      articlesCleaned: catRes.count,
    });
  } catch (err: any) {
    console.warn("[PURGE-JUNK-IMAGE] Error:", err?.message || err);
    return NextResponse.json({ success: false, error: "Gagal membersihkan gambar sampah" }, { status: 500 });
  }
}

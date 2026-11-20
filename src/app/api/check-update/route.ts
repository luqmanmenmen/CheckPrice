import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Hanya event yang berpotensi membawa produk baru atau perubahan promo aktif
// yang menaikkan catalogVersion ("UPDATE SEKARANG"). Update stok/foto/PQ harian
// TIDAK boleh menyalakan notifikasi merah di HP kasir.
const CATALOG_SYNC_TYPES = [
  "CATALOG_BUNDLE",
  "UPDATE_PROMO",
  "PROMO_MINGGUAN",
];

interface CheckUpdatePayload {
  success: boolean;
  lastUpdate: number;
  catalogVersion: number;
  stockLastUpdate: number;
  snapshotUrl: string | null;
  snapshotRevision: number | null;
  snapshotGzipBytes: number | null;
  snapshotTotalSkus: number | null;
  snapshotTotalModels: number | null;
}

let cachedPayload: CheckUpdatePayload | null = null;
let cachedAtMs = 0;
let lastKnownManifest: any = null;
const CHECK_CACHE_TTL_MS = 60_000;

async function fetchStorageManifest() {
  const supaUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!supaUrl) return lastKnownManifest;
  try {
    const res = await fetch(
      `${supaUrl}/storage/v1/object/public/excel-uploads/offline-db/manifest.json`,
      { cache: "no-store", signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return lastKnownManifest;
    const json = await res.json();
    if (json && typeof json === "object") {
      lastKnownManifest = json;
      return json;
    }
    return lastKnownManifest;
  } catch {
    return lastKnownManifest;
  }
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedPayload && now - cachedAtMs < CHECK_CACHE_TTL_MS) {
      return NextResponse.json(
        { ...cachedPayload, cached: true },
        {
          headers: {
            "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
          },
        }
      );
    }

    const [latestCatalogSync, latestProduct, manifest] = await Promise.all([
      prisma.syncHistory.findFirst({
        where: {
          status: "SUCCESS",
          type: { in: CATALOG_SYNC_TYPES },
          records: { gt: 0 },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.product.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      fetchStorageManifest(),
    ]);

    const syncMs = latestCatalogSync ? latestCatalogSync.createdAt.getTime() : 0;
    const manifestCatalogMs = Number(manifest?.catalogVersion || 0) || 0;
    const catalogVersion = Math.max(syncMs, manifestCatalogMs);
    const stockLastUpdate = latestProduct ? latestProduct.updatedAt.getTime() : catalogVersion;

    const payload: CheckUpdatePayload = {
      success: true,
      lastUpdate: catalogVersion,
      catalogVersion,
      stockLastUpdate,
      snapshotUrl: typeof manifest?.snapshotUrl === "string" ? manifest.snapshotUrl : null,
      snapshotRevision: manifest?.bundleRevision ? Number(manifest.bundleRevision) : null,
      snapshotGzipBytes: manifest?.gzipBytes ? Number(manifest.gzipBytes) : null,
      snapshotTotalSkus: manifest?.totalSkus ? Number(manifest.totalSkus) : null,
      snapshotTotalModels: manifest?.totalModels ? Number(manifest.totalModels) : null,
    };

    cachedPayload = payload;
    cachedAtMs = now;

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch {
    if (cachedPayload) {
      return NextResponse.json({ ...cachedPayload, stale: true });
    }
    return NextResponse.json({ success: false, error: "Gagal cek update" }, { status: 500 });
  }
}

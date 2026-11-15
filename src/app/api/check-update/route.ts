import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CATALOG_SYNC_TYPES = [
  "CATALOG_BUNDLE",
  "MDS_BISA_SYNC",
  "PHOTO_SYNC",
  "UPDATE_PROMO",
  "PROMO_MINGGUAN",
  "EXCEL_UPLOAD",
  "SYNC_PQ",
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
const CHECK_CACHE_TTL_MS = 15000;

async function fetchStorageManifest() {
  const supaUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!supaUrl) return null;
  try {
    const res = await fetch(
      `${supaUrl}/storage/v1/object/public/excel-uploads/offline-db/manifest.json?t=${Date.now()}`,
      { cache: "no-store", signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
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
            "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
          },
        }
      );
    }

    const [latestCatalogSync, latestProduct, manifest] = await Promise.all([
      prisma.syncHistory.findFirst({
        where: {
          status: "SUCCESS",
          type: { in: CATALOG_SYNC_TYPES },
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
        "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch {
    if (cachedPayload) {
      return NextResponse.json({ ...cachedPayload, stale: true });
    }
    return NextResponse.json({ success: false, error: "Gagal cek update" }, { status: 500 });
  }
}

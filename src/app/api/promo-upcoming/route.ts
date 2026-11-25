import { NextRequest, NextResponse } from "next/server";
import { fetchStorageAnalyticsJson } from "@/lib/productQueryHelpers";
import { writeTursoStorage, readTursoStorageJson } from "@/lib/tursoStorage";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/promo-upcoming
 * Membaca draft promo H-2 / H-1 dari Turso Storage (`analytics/upcoming-promo.json`)
 * beserta status auto-aktivasi Kamis 00:00 WIB tanpa menyentuh tabel Product.
 */
export async function GET() {
  try {
    const [draft, promoLock] = await Promise.all([
      fetchStorageAnalyticsJson("upcoming-promo.json"),
      readTursoStorageJson<any>("logs/upcoming-auto-promoted.json").catch(() => null),
    ]);
    if (!draft) {
      return NextResponse.json({
        success: true,
        available: false,
        message: "Belum ada draf promo H-2 / H-1 yang diproses.",
      });
    }
    const folder = String(draft.sourceFolder || draft.folderName || "").trim();
    const lockMatched = Boolean(promoLock && folder && promoLock.folder === folder);
    const autoActivatedAt =
      draft.autoActivatedAt || (lockMatched ? promoLock.completedAt || promoLock.triggeredAt || null : null);
    return NextResponse.json(
      {
        ...draft,
        sourceFolder: folder,
        effectiveLaunchDate: draft.effectiveLaunchDate || draft.fromDate || null,
        autoActivatedAt,
        autoPromoted: Boolean(autoActivatedAt),
        available: true,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal memuat draf promo mendatang" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/promo-upcoming
 * Khusus Supervisor/Dev: Unggah file Excel promo H-2/H-1 ke folder aman `PROMO/UPCOMING_<tgl>`
 * atau kompilasi ulang folder promo masa depan lewat Python Engine (`upcoming-promo`)
 * TANPA mengubah harga promo berjalan di kasir.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: "Silakan login terlebih dahulu" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    const isSuperOrDev = user?.role === "SUPERVISOR" || user?.nik === "22054178";
    if (!isSuperOrDev) {
      return NextResponse.json(
        { success: false, error: "Khusus Supervisor / Developer untuk unggah draf H-2" },
        { status: 403 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    const uploadedPaths: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("file") as File[];
      const targetStartDate = String(formData.get("startDate") || "").trim();
      const safeDateTag = /^\d{4}-\d{2}-\d{2}$/.test(targetStartDate)
        ? targetStartDate
        : new Date(Date.now() + 2 * 86400 * 1000).toISOString().slice(0, 10);
      const folder = `PROMO/UPCOMING_${safeDateTag}`;

      for (const f of files) {
        if (!f || !f.name) continue;
        const buf = Buffer.from(await f.arrayBuffer());
        const objectPath = `${folder}/${f.name}`;
        await writeTursoStorage(
          objectPath,
          buf,
          f.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        uploadedPaths.push(objectPath);
      }
    }

    const dispatched = await dispatchToGitHubRunner({
      action: "upcoming-promo",
      force: true,
      userId: user?.id || null,
    });

    return NextResponse.json(
      {
        ...dispatched.payload,
        uploadedFiles: uploadedPaths,
        mode: "UPCOMING_POP_DRAFT_PYTHON",
        message:
          uploadedPaths.length > 0
            ? `${uploadedPaths.length} file draf POP diunggah & sedang dianalisis Python (~20 dtk). Promo kasir hari ini tetap aman!`
            : "Python Engine sedang menyusun ulang draf POP H-2/H-1 dari folder Storage terbaru!",
      },
      { status: dispatched.status }
    );
  } catch (error: any) {
    console.error("[PROMO-UPCOMING POST]", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal memproses draf promo mendatang" },
      { status: 500 }
    );
  }
}

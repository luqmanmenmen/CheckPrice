import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/clean-promo (Opsi A)
 * Membersihkan promo expired berbasis WIB dengan 1 query SQL atomik tanpa menarik
 * puluhan ribu baris ke memori TypeScript, lalu menjadwalkan Python analytics refresh.
 */
export async function POST() {
  try {
    const todayWib = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const cleanedCount = await prisma.$executeRawUnsafe(
      `
      UPDATE "Product"
      SET "hargaPromo" = NULL,
          diskon = NULL,
          "discountType" = NULL,
          acara = NULL,
          "fromDate" = NULL,
          "toDate" = NULL
      WHERE ("hargaPromo" IS NOT NULL OR diskon IS NOT NULL OR acara IS NOT NULL)
        AND "toDate" IS NOT NULL
        AND SUBSTRING(TRIM("toDate"), 1, 10) ~ '^\\d{4}-\\d{2}-\\d{2}$'
        AND SUBSTRING(TRIM("toDate"), 1, 10) < $1
      `,
      todayWib
    );

    if (cleanedCount > 0) {
      // Refresh CatalogArticle, snapshot CDN, & analytics JSON lewat Python runner
      void dispatchToGitHubRunner({ action: "analytics", force: true }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      mode: "SQL_ATOMIC_PLUS_PYTHON",
      cleanedCount: Number(cleanedCount || 0),
      message: `Berhasil membersihkan ${Number(cleanedCount || 0)} promo kadaluarsa (< ${todayWib} WIB).`,
    });
  } catch (error) {
    console.error("Error cleaning promos:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/po/generate (Opsi A)
 * Pensiunkan loop N+1 findFirst/create TypeScript; gunakan 1 query INSERT...SELECT atomik
 * dan sinkronisasi penuh lewat python-engine/run_admin_analytics.py.
 */
export async function POST() {
  try {
    const generatedCount = await prisma.$executeRawUnsafe(`
      INSERT INTO "PoSuggestion" (id, "productId", "suggestedQty", reason, status, "createdAt", "updatedAt")
      SELECT
        'po_' || lower(hex(randomblob(8))),
        p.id,
        MAX(0, CAST((p.sales_mtd * 24 + 13) / 14 AS INTEGER) - p.stok),
        'Dalam 14 hari terakhir terjual ' || p.sales_mtd || ' pcs (Rata-rata '
          || printf('%.1f', CAST(p.sales_mtd AS REAL) / 14.0)
          || ' pcs/hari). Sisa stok ' || p.stok
          || ' pcs. Disarankan pesan '
          || MAX(0, CAST((p.sales_mtd * 24 + 13) / 14 AS INTEGER) - p.stok)
          || ' pcs untuk target 14 hari.',
        'OPEN',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      FROM "Product" p
      WHERE p.sales_mtd > 5
        AND p.stok <= CAST((p.sales_mtd * 10 + 13) / 14 AS INTEGER)
        AND (CAST((p.sales_mtd * 24 + 13) / 14 AS INTEGER) - p.stok) > 0
        AND NOT EXISTS (
          SELECT 1 FROM "PoSuggestion" s
          WHERE s."productId" = p.id AND s.status = 'OPEN'
        )
    `);

    void dispatchToGitHubRunner({ action: "analytics", force: true }).catch(() => {});

    return NextResponse.json({
      success: true,
      mode: "SQL_ATOMIC_PLUS_PYTHON",
      generatedCount: Number(generatedCount || 0),
      message: `Berhasil men-generate ${Number(generatedCount || 0)} saran PO baru.`,
    });
  } catch (error) {
    console.error("Error generating PO suggestions:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

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
        'po_' || md5(p.id::text || '_' || extract(epoch from now())::text),
        p.id,
        GREATEST(0, CEIL((p.sales_mtd::numeric / 14.0) * 24.0)::int - p.stok),
        'Dalam 14 hari terakhir terjual ' || p.sales_mtd || ' pcs (Rata-rata '
          || TO_CHAR(p.sales_mtd::numeric / 14.0, 'FM999990.0')
          || ' pcs/hari). Sisa stok ' || p.stok
          || ' pcs. Disarankan pesan '
          || GREATEST(0, CEIL((p.sales_mtd::numeric / 14.0) * 24.0)::int - p.stok)
          || ' pcs untuk target 14 hari.',
        'OPEN',
        NOW(),
        NOW()
      FROM "Product" p
      WHERE p.sales_mtd > 5
        AND p.stok <= CEIL((p.sales_mtd::numeric / 14.0) * 10.0)
        AND GREATEST(0, CEIL((p.sales_mtd::numeric / 14.0) * 24.0)::int - p.stok) > 0
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

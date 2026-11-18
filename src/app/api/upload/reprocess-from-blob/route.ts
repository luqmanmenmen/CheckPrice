import { NextRequest, NextResponse } from "next/server";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload/reprocess-from-blob (Opsi A — Delegasi Penuh ke Python Engine)
 * Parser xlsx TypeScript dipensiunkan; file di Supabase Storage diproses langsung oleh
 * `python-engine/run_promo_sync.py` + `build_catalog_index.py` di GitHub Actions.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;

    const body = await request.json().catch(() => ({}));
    const type = String(body?.type || "PROMO").toUpperCase();
    const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl : "";

    const result = await dispatchToGitHubRunner({
      action: type === "PQ" ? "stock-only" : "promo",
      force: true,
      promoUrl: fileUrl,
      userId: session?.userId || null,
    });

    return NextResponse.json(
      {
        ...result.payload,
        mode: "PYTHON_ENGINE",
      },
      { status: result.status }
    );
  } catch (error: any) {
    console.error("[REPROCESS-FROM-BLOB -> PYTHON]", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal memicu Python Engine" },
      { status: 500 }
    );
  }
}

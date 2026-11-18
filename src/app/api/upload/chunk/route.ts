import { NextRequest, NextResponse } from "next/server";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload/chunk (Opsi A — Murni Thin Dispatcher ke Python Engine)
 * Mesin parsing promo/Excel TypeScript telah dipensiunkan untuk mencegah bentrok
 * aturan & beban Disk IO. Seluruh pengolahan file promo dialihkan ke python-engine/.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const session = token ? await verifyToken(token) : null;

    const body = await request.json().catch(() => ({}));
    const rawType = String(body?.type || "UPDATE_PROMO").toUpperCase();
    const fileUrl = typeof body?.fileUrl === "string" ? body.fileUrl : "";
    const isLastChunk = body?.isLastChunk !== false;

    // Hanya dispatch ke Python saat chunk akhir atau trigger langsung (mencegah spam run)
    if (!isLastChunk) {
      return NextResponse.json({
        success: true,
        delegated: false,
        mode: "PYTHON_ENGINE",
        message: "Chunk dicatat. Eksekusi Python dimulai pada akhir batch.",
      });
    }

    const action = rawType === "PQ_HARIAN" ? "stock-only" : "promo";
    const result = await dispatchToGitHubRunner({
      action,
      force: true,
      promoUrl: fileUrl,
      userId: session?.userId || null,
    });

    return NextResponse.json(
      {
        ...result.payload,
        mode: "PYTHON_ENGINE",
        delegated: true,
      },
      { status: result.status }
    );
  } catch (error: any) {
    console.error("[UPLOAD/CHUNK -> PYTHON]", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Gagal meneruskan ke Python Engine" },
      { status: 500 }
    );
  }
}

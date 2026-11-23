import { NextResponse } from "next/server";
import { invokePythonLiveEngine } from "@/lib/pyLiveBridge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
    const article = typeof body?.article === "string" ? body.article.trim() : "";
    const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";

    if (!sku && !article && !barcode) {
      return NextResponse.json(
        { success: false, healed: false, error: "sku atau article wajib diisi" },
        { status: 400 }
      );
    }

    const result = await invokePythonLiveEngine(
      { action: "heal-image", sku, article, barcode },
      { requestUrl: req.url, timeoutMs: 8000 }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API HEAL-IMAGE] Error:", err);
    return NextResponse.json(
      { success: false, healed: false, error: "Gagal memulihkan foto produk" },
      { status: 500 }
    );
  }
}

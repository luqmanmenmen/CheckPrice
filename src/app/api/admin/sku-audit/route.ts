import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { fetchStorageAnalyticsJson } from "@/lib/productQueryHelpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sku-audit
 * Membaca 1 file pre-computed `analytics/sku-audit-pivot.json` dari Turso Storage (1 row read, 0 full-scan!).
 * Menyediakan Tabel Pivot Kelengkapan SKU (Barcode • Gambar • Harga Normal) per Toko (SUKO / Mu+Ku / ZES)
 * beserta sampel daftar SKU yang masih belum komplit.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const session = token ? await verifyToken(token) : null;
    if (!session || (session.role !== "SUPERVISOR" && session.nik !== "22054178")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const pivot = await fetchStorageAnalyticsJson<any>("sku-audit-pivot.json");
    if (!pivot) {
      return NextResponse.json({
        success: true,
        ready: false,
        message: "Pivot audit belum dibuat. Jalankan trigger sinkronisasi agar Python menyusun tabel pivot.",
      });
    }

    return NextResponse.json({
      ...pivot,
      ready: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal membaca data pivot audit SKU" },
      { status: 500 }
    );
  }
}

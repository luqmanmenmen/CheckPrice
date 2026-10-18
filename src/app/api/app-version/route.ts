import { NextResponse } from "next/server";
import { APP_VERSION, APP_BUILD_ID } from "@/lib/version";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionInfo = {
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    releaseDate: "2026-10-18T13:55:00+07:00",
    notes: "Pembaruan v2.5.1: Mesin Barcode Scanner 1D super cepat (<50ms), server-side caching export produk (<100ms), dan IndexedDB v10 self-healing anti-stuck."
  };

  return NextResponse.json(versionInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

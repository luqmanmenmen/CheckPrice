import { NextResponse } from "next/server";
import { APP_VERSION, APP_BUILD_ID } from "@/lib/version";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionInfo = {
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    releaseDate: "2026-10-19T00:26:00+07:00",
    notes: "Pembaruan v2.5.3: Pemindai SKU (8 Digit) zero-freeze, anti-kode artikel ber-strip (605-12218278), dan pembacaan multi-baris presisi."
  };

  return NextResponse.json(versionInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

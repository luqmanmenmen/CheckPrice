import { NextResponse } from "next/server";
import { APP_VERSION, APP_BUILD_ID } from "@/lib/version";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionInfo = {
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    releaseDate: "2026-10-18T14:25:00+07:00",
    notes: "Pembaruan v2.5.2: Pemindai SKU (8 Digit) super cepat ~40ms, filter anti-strip pabrik (-), notice merah target salah, dan IndexedDB v10 instan."
  };

  return NextResponse.json(versionInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

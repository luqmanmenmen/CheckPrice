import { NextResponse } from "next/server";
import { APP_VERSION, APP_BUILD_ID } from "@/lib/version";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionInfo = {
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    releaseDate: "2026-10-20T02:50:00+07:00",
    notes: "Pembaruan v2.5.6: Desain responsif bertingkat untuk Best Seller, Stok Kritis, dan Slow Moving. Nominal omzet dan sisa stok rapi dalam box tanpa offside di HP, Tablet, maupun PC."
  };

  return NextResponse.json(versionInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

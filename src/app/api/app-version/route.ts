import { NextResponse } from "next/server";
import { APP_VERSION, APP_BUILD_ID } from "@/lib/version";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const versionInfo = {
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    releaseDate: "2026-10-20T02:15:00+07:00",
    notes: "Pembaruan v2.5.5: Rekapitulasi frekuensi login karyawan, pencatatan log riwayat login, dan verifikasi status kehadiran online/offline riil berbasis aktivitas."
  };

  return NextResponse.json(versionInfo, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

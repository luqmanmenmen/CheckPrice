import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  const { blobs } = await list({ prefix: `PROMO/` });
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - 3);

  return NextResponse.json({
    thresholdDate: thresholdDate.toISOString(),
    blobs: blobs.map(b => ({
      url: b.url,
      uploadedAt: b.uploadedAt,
      isOlder: new Date(b.uploadedAt) < thresholdDate
    }))
  });
}

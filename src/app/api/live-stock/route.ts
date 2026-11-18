import { NextRequest, NextResponse } from 'next/server';
import { checkSingleItemStock } from '@/lib/mdsBisaClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sku = body.sku || req.nextUrl.searchParams.get('sku');

    if (!sku) {
      return NextResponse.json({ success: false, error: 'SKU produk wajib diisi' }, { status: 400 });
    }

    const result = await checkSingleItemStock(String(sku), {
      discoverFamily: body.discoverFamily !== false,
      withImages: body.withImages !== false,
      syncAllSizes: body.syncAllSizes !== false,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Gagal memeriksa stok live',
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get('sku');
  if (!sku) {
    return NextResponse.json({ success: false, error: 'SKU produk wajib diisi' }, { status: 400 });
  }

  const discoverFamily = req.nextUrl.searchParams.get('discoverFamily') !== '0';
  const withImages = req.nextUrl.searchParams.get('withImages') !== '0';
  const result = await checkSingleItemStock(String(sku), { discoverFamily, withImages });
  return NextResponse.json(result);
}


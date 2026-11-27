import { NextRequest, NextResponse } from 'next/server';
import { invokePythonLiveEngine, FastLiveVariantInput } from '@/lib/pyLiveBridge';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sku = body.sku || req.nextUrl.searchParams.get('sku');

    if (!sku) {
      return NextResponse.json({ success: false, error: 'SKU produk wajib diisi' }, { status: 400 });
    }

    const familyVariants: FastLiveVariantInput[] = Array.isArray(body.familyVariants)
      ? body.familyVariants
          .filter((v: any) => v && v.sku)
          .map((v: any) => ({
            sku: String(v.sku).trim(),
            color: v.color ? String(v.color).trim() : null,
            size: v.size ? String(v.size).trim() : null,
            stok: typeof v.stok === 'number' ? v.stok : undefined,
          }))
      : [];

    const brandGroup = typeof body.brandGroup === 'string' ? body.brandGroup.trim().toUpperCase() : null;

    if (body.fastMode === true && familyVariants.length > 0) {
      const result = await invokePythonLiveEngine(
        {
          action: 'fast-stock',
          sku: String(sku),
          familyVariants,
          article: typeof body.article === 'string' ? body.article : null,
          brandGroup,
        },
        { requestUrl: req.url, timeoutMs: 8500 }
      );
      return NextResponse.json(result);
    }

    const result = await invokePythonLiveEngine(
      {
        action: 'scan',
        sku: String(sku),
        withImages: body.withImages !== false,
        maxSeconds: 5.5,
        preferredAccount: brandGroup === 'MUKU' ? 'muku' : brandGroup === 'SUKO' ? 'suko' : undefined,
      },
      { requestUrl: req.url, timeoutMs: 9000 }
    );
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Gagal memeriksa stok live',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get('sku');
  if (!sku) {
    return NextResponse.json({ success: false, error: 'SKU produk wajib diisi' }, { status: 400 });
  }

  const withImages = req.nextUrl.searchParams.get('withImages') !== '0';
  const result = await invokePythonLiveEngine(
    {
      action: 'scan',
      sku: String(sku),
      withImages,
      maxSeconds: 6.5,
    },
    { requestUrl: req.url, timeoutMs: 9500 }
  );
  return NextResponse.json(result);
}

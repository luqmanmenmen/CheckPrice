import { NextRequest, NextResponse, after } from 'next/server';
import { checkSingleItemStock, checkLiveStockFast, FastLiveVariantInput } from '@/lib/mdsBisaClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sku = body.sku || req.nextUrl.searchParams.get('sku');

    if (!sku) {
      return NextResponse.json({ success: false, error: 'SKU produk wajib diisi' }, { status: 400 });
    }

    // JALUR TOL KHUSUS LIVE STOK: HP kasir sudah memegang daftar varian (sku, color, size, stok)
    // -> 1 request langsung ke StoreHub (+ peta relatedStock), 0 baca DB, simpan perubahan ke DB di background!
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
    const familySkus: string[] = Array.isArray(body.familySkus)
      ? body.familySkus.map((s: any) => String(s || '').trim()).filter(Boolean)
      : familyVariants.map((v) => v.sku);

    const brandGroup = typeof body.brandGroup === 'string' ? body.brandGroup.trim().toUpperCase() : null;

    if (body.fastMode === true && (familySkus.length > 0 || familyVariants.length > 0)) {
      const { result, persist } = await checkLiveStockFast(
        String(sku),
        familySkus,
        familyVariants,
        typeof body.article === 'string' ? body.article : null,
        brandGroup
      );
      if (result.success) {
        after(async () => {
          await persist().catch(() => {});
        });
      }
      return NextResponse.json({ ...result, fastMode: true });
    }

    // JALUR SCRAP PRODUK BARU / BARCODE TIDAK DITEMUKAN + FOTO:
    // Langsung simpan tuntas ke 3 tabel DB (Product + images[], BarcodeAlias, CatalogArticle) sebelum return!
    const result = await checkSingleItemStock(String(sku), {
      discoverFamily: body.discoverFamily !== false,
      withImages: body.withImages !== false,
      syncAllSizes: body.syncAllSizes !== false,
      preferredAccount: brandGroup === 'MUKU' ? 'muku' : undefined,
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

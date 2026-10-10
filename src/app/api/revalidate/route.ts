import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

const SECRET = process.env.WEBHOOK_SECRET || 'B4mb4ng123!Aman';

/**
 * POST /api/revalidate
 * Dipanggil oleh Python Engine di Render.com setelah selesai upsert ke Supabase DB.
 * Tugas Vercel di sini hanya satu: revalidate cache supaya halaman tampil data terbaru.
 */
export async function POST(request: Request) {
  try {
    const { secret, type } = await request.json();

    if (secret !== SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Revalidate semua halaman yang menampilkan data harga
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/api/products');

    console.log(`[REVALIDATE] Cache di-refresh oleh Python Engine. Type: ${type}`);

    return NextResponse.json({
      success:     true,
      revalidated: true,
      type:        type,
      timestamp:   new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[REVALIDATE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to revalidate', details: error.message },
      { status: 500 }
    );
  }
}

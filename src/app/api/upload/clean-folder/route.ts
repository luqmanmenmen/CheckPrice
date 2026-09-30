import { list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { folder } = await request.json();

    if (!folder) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    // Ambil daftar semua file di folder tersebut
    const { blobs } = await list({ prefix: `${folder}/` });
    
    // Kumpulkan semua URL file lama
    const urlsToDelete = blobs.map(blob => blob.url);

    // Hapus sekaligus jika ada file lama
    if (urlsToDelete.length > 0) {
      await del(urlsToDelete);
      console.log(`Berhasil menghapus ${urlsToDelete.length} file lama dari folder ${folder}`);
    }

    return NextResponse.json({ success: true, deletedCount: urlsToDelete.length });
  } catch (error) {
    console.error("Vercel Blob delete error:", error);
    return NextResponse.json({ error: 'Failed to delete blobs' }, { status: 500 });
  }
}

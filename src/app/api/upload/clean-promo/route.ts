import { list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { folder, daysOld } = await request.json();

    if (!folder || folder !== "PROMO") {
      return NextResponse.json({ error: 'Folder must be PROMO' }, { status: 400 });
    }

    // Ambil daftar semua file di folder tersebut (handle pagination jika banyak)
    let hasMore = true;
    let cursor: string | undefined = undefined;
    let totalDeleted = 0;

    while (hasMore) {
      const listResult: any = await list({
        prefix: `${folder}/`,
        cursor: cursor,
        limit: 1000,
      });

      let urlsToDelete: string[] = [];
      if (typeof daysOld === 'number') {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - daysOld);
        urlsToDelete = listResult.blobs
          .filter((blob: any) => new Date(blob.uploadedAt) < thresholdDate)
          .map((blob: any) => blob.url);
      } else {
        urlsToDelete = listResult.blobs.map((blob: any) => blob.url);
      }

      if (urlsToDelete.length > 0) {
        // Hapus dalam batch untuk menghindari limit
        const chunkSize = 100;
        for (let i = 0; i < urlsToDelete.length; i += chunkSize) {
          const chunk = urlsToDelete.slice(i, i + chunkSize);
          await del(chunk);
          totalDeleted += chunk.length;
        }
      }

      hasMore = listResult.hasMore;
      cursor = listResult.cursor;
    }

    console.log(`Berhasil menghapus ${totalDeleted} file lama dari folder ${folder}`);
    return NextResponse.json({ success: true, deletedCount: totalDeleted });
  } catch (error) {
    console.error("Vercel Blob delete PROMO error:", error);
    return NextResponse.json({ error: 'Failed to delete blobs' }, { status: 500 });
  }
}

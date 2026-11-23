import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { listTursoStorage, getTursoPublicUrl } from '@/lib/tursoStorage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "PROMO";

    const files = await listTursoStorage(folder);
    const validFiles = files ? files.filter(f => f.name !== '.emptyFolderPlaceholder') : [];

    const mappedBlobs = validFiles.map(f => {
      const pathname = `${folder}/${f.name}`;
      const url = getTursoPublicUrl(pathname);
      return {
        url,
        pathname,
        uploadedAt: f.created_at,
        filename: f.name
      };
    });
    
    // Cek mana saja file yang sudah berhasil di-sync sebelumnya
    const blobUrls = mappedBlobs.map(b => b.url);
    const syncedHistories = await prisma.syncHistory.findMany({
      where: {
        fileUrl: { in: blobUrls },
        status: "SUCCESS"
      }
    });
    const syncedUrls = new Set(syncedHistories.map(h => h.fileUrl));
    
    return NextResponse.json({
      success: true,
      blobs: mappedBlobs.map(b => ({
        ...b,
        isSynced: syncedUrls.has(b.url)
      }))
    });
  } catch (error: any) {
    console.error("List storage error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

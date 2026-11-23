import { NextResponse } from 'next/server';
import { listTursoStorage, removeTursoStorage, getTursoPublicUrl } from '@/lib/tursoStorage';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { folder, daysOld } = await request.json();

    if (!folder || folder !== "PROMO") {
      return NextResponse.json({ error: 'Folder must be PROMO' }, { status: 400 });
    }

    const files = await listTursoStorage(folder);
    const validFiles = files ? files.filter(f => f.name !== '.emptyFolderPlaceholder') : [];
    let urlsToDelete: string[] = [];

    if (typeof daysOld === 'number') {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - daysOld);

      urlsToDelete = validFiles
        .filter(f => new Date(f.created_at!) < thresholdDate)
        .map(f => `${folder}/${f.name}`);
    } else {
      urlsToDelete = validFiles.map(f => `${folder}/${f.name}`);
    }

    let totalDeleted = 0;
    if (urlsToDelete.length > 0) {
      totalDeleted = await removeTursoStorage(urlsToDelete);
    }

    const debugBlobs = validFiles.slice(0, 5).map(f => {
      const url = getTursoPublicUrl(`${folder}/${f.name}`);
      return {
        url,
        uploadedAt: f.created_at,
        isOlder: typeof daysOld === 'number' ? new Date(f.created_at!) < new Date(new Date().setDate(new Date().getDate() - daysOld)) : false
      };
    });

    console.log(`Berhasil menghapus ${totalDeleted} file lama dari folder ${folder}`);
    return NextResponse.json({ success: true, deletedCount: totalDeleted, debugBlobs });
  } catch (error: any) {
    console.error("Turso Storage delete PROMO error:", error);
    return NextResponse.json({ error: 'Failed to delete storage files', details: error.message }, { status: 500 });
  }
}

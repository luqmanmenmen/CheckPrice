import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { supabase } from '@/lib/supabaseClient';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "PQ";
    
    const { data: files, error } = await supabase.storage
      .from('excel-uploads')
      .list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
      
    if (error) throw error;
    
    // Filter out the empty placeholder file that Supabase creates for empty folders (.emptyFolderPlaceholder)
    const validFiles = files ? files.filter(f => f.name !== '.emptyFolderPlaceholder') : [];
    
    // Map to the format frontend expects
    const mappedBlobs = validFiles.map(f => {
      const pathname = `${folder}/${f.name}`;
      const url = supabase.storage.from('excel-uploads').getPublicUrl(pathname).data.publicUrl;
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

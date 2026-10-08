import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { folder } = await request.json();

    if (!folder) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    // Ambil daftar semua file di folder tersebut
    const { data: files, error: listError } = await supabase.storage
      .from('excel-uploads')
      .list(folder);
      
    if (listError) throw listError;

    const validFiles = files ? files.filter(f => f.name !== '.emptyFolderPlaceholder') : [];
    
    // Kumpulkan semua paths
    const pathsToDelete = validFiles.map(f => `${folder}/${f.name}`);

    // Hapus sekaligus jika ada file lama
    if (pathsToDelete.length > 0) {
      const { error: delError } = await supabase.storage
        .from('excel-uploads')
        .remove(pathsToDelete);
        
      if (delError) throw delError;
        
      console.log(`Berhasil menghapus ${pathsToDelete.length} file lama dari folder ${folder}`);
    }

    return NextResponse.json({ success: true, deletedCount: pathsToDelete.length });
  } catch (error: any) {
    console.error("Supabase Storage delete error:", error);
    return NextResponse.json({ error: error.message || 'Failed to delete blobs' }, { status: 500 });
  }
}

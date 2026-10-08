import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  const { data: files } = await supabase.storage.from('excel-uploads').list('PROMO');
  const validFiles = files ? files.filter(f => f.name !== '.emptyFolderPlaceholder') : [];
  
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - 3);

  return NextResponse.json({
    thresholdDate: thresholdDate.toISOString(),
    blobs: validFiles.map(b => {
      const url = supabase.storage.from('excel-uploads').getPublicUrl(`PROMO/${b.name}`).data.publicUrl;
      return {
        url,
        uploadedAt: b.created_at,
        isOlder: new Date(b.created_at) < thresholdDate
      };
    })
  });
}

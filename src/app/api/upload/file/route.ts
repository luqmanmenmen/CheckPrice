import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'Lainnya';

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Convert file to ArrayBuffer for Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filePath = `${folder}/${file.name}`;

    const { data, error } = await supabase
      .storage
      .from('excel-uploads')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      });

    if (error) {
      console.error("Supabase Storage Error:", error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('excel-uploads')
      .getPublicUrl(filePath);

    return NextResponse.json({ 
      url: publicUrl,
      pathname: filePath
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || 'Failed to upload to storage' }, { status: 500 });
  }
}

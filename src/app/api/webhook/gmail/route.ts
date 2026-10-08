import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Ganti secret token ini atau letakkan di .env sebagai WEBHOOK_SECRET
const SECRET_TOKEN = process.env.WEBHOOK_SECRET || "B4mb4ng123!Aman";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const token = formData.get('token') as string;
    const folder = (formData.get('folder') as string) || "PQ"; // Otomatis simpan ke folder yang diminta (PQ atau PROMO)

    // Validasi token keamanan
    if (token !== SECRET_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const explicitFileName = formData.get('fileName') as string;
    const finalFileName = explicitFileName || file.name || "uploaded_file";

    console.log("Menerima file dari Webhook Gmail:", finalFileName);

    // Konversi file ke Buffer untuk Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filePath = `${folder}/${finalFileName}`;

    // Langsung unggah ke Supabase Storage di dalam folder yang diminta
    const { error: uploadError } = await supabase.storage
      .from('excel-uploads')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('excel-uploads')
      .getPublicUrl(filePath);

    console.log("Berhasil unggah ke Supabase Storage:", publicUrl);

    // Trigger sinkronisasi otomatis
    try {
      const syncUrl = new URL('/api/upload/sync-latest-blob', request.url).toString();
      console.log("Triggering auto-sync to:", syncUrl);
      
      // Wait for the sync to complete so serverless function doesn't die early
      const syncRes = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          type: folder === "PROMO" ? "UPDATE_PROMO" : "PQ_HARIAN", 
          explicitUrl: publicUrl, 
          explicitFileName: finalFileName 
        })
      });
      
      const syncData = await syncRes.text();
      console.log("Auto-sync response:", syncData);
    } catch (e) {
      console.error("Gagal menjalankan auto sync:", e);
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error("Gmail Webhook error:", error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

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

    // Langsung unggah ke Vercel Blob di dalam folder yang diminta
    const blob = await put(`${folder}/${finalFileName}`, file, {
      access: 'public',
      addRandomSuffix: false // Pertahankan nama aslinya
    });

    console.log("Berhasil unggah ke Vercel Blob:", blob.url);

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
          explicitUrl: blob.url, 
          explicitFileName: finalFileName 
        })
      });
      
      const syncData = await syncRes.text();
      console.log("Auto-sync response:", syncData);
    } catch (e) {
      console.error("Gagal menjalankan auto sync:", e);
    }

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error("Gmail Webhook error:", error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

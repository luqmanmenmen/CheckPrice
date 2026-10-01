import { list } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "PQ";
    
    const { blobs } = await list({ prefix: `${folder}/` });
    
    // Sort oldest to newest
    const sortedBlobs = blobs.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
    
    return NextResponse.json({
      success: true,
      blobs: sortedBlobs.map(b => ({
        url: b.url,
        pathname: b.pathname,
        uploadedAt: b.uploadedAt,
        filename: b.pathname.replace(`${folder}/`, '')
      }))
    });
  } catch (error: any) {
    console.error("List blob error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

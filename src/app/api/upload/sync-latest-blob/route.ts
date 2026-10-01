import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import * as xlsx from "xlsx";

const prisma = new PrismaClient();
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { type, explicitUrl, explicitFileName } = await request.json(); // e.g. "PQ_HARIAN" or "PROMO"
    
    let urls = [];
    let fileName = "";
    let fileDateStr = "";

    if (explicitUrl) {
      urls = explicitUrl.split(",");
      fileName = explicitFileName || "BlobFile";
      fileDateStr = new Date().toISOString(); // fallback
    } else {
      // Find latest file in SyncHistory for this type
      const latestSync = await prisma.syncHistory.findFirst({
        where: { type: type || "PQ_HARIAN", fileUrl: { not: null } },
        orderBy: { createdAt: "desc" },
      });

      if (!latestSync || !latestSync.fileUrl) {
        return NextResponse.json({ success: false, error: `Belum ada file ter-upload di Blob untuk tipe ${type || "PQ_HARIAN"}` }, { status: 404 });
      }
      
      urls = latestSync.fileUrl.split(",");
      fileName = latestSync.fileName || "BlobFile";
      fileDateStr = latestSync.createdAt.toISOString();
    }

    let allRows: any[] = [];

    for (const url of urls) {
      console.log("Downloading from blob:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Gagal download file dari Blob");

      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);

      // Read workbook
      const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(ws, { defval: "" });
        const rowsWithSource = rawRows.map((r: any) => ({
          ...r,
          __SOURCE_FILE__: fileName,
          __SOURCE_SHEET__: sheetName
        }));
        allRows = allRows.concat(rowsWithSource);
      }
    }

    if (allRows.length === 0) {
      return NextResponse.json({ success: false, error: "File Excel/CSV kosong atau format salah" }, { status: 400 });
    }

    // Helper untuk ekstrak tanggal dari nama file
    const extractDate = (filename: string) => {
      const match = filename.toUpperCase().match(/POWER QUERY (\d{1,2}) ([A-Z]+) (\d{4})/);
      if (match) {
        const months: Record<string, number> = {
          "JANUARI": 0, "JANUARY": 0, "JAN": 0, "FEBRUARI": 1, "FEB": 1,
          "MARET": 2, "MARCH": 2, "MAR": 2, "APRIL": 3, "APR": 3,
          "MEI": 4, "MAY": 4, "JUNI": 5, "JUN": 5, "JULI": 6, "JUL": 6,
          "AGUSTUS": 7, "AUG": 7, "SEPTEMBER": 8, "SEP": 8,
          "OKTOBER": 9, "OCT": 9, "NOVEMBER": 10, "NOV": 10, "DESEMBER": 11, "DEC": 11
        };
        const month = months[match[2]] !== undefined ? months[match[2]] : new Date().getMonth();
        return new Date(parseInt(match[3]), month, parseInt(match[1]), 12, 0, 0);
      }
      return new Date(fileDateStr);
    };

    // Forward to /api/upload/chunk
    const CHUNK_SIZE = 500;
    const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
    const origin = request.nextUrl.origin;
    
    // Pass cookies for auth to the chunk endpoint
    const cookies = request.headers.get("cookie") || "";

    for (let i = 0; i < totalChunks; i++) {
      const chunk = allRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const payload = {
        type: type || "PQ_HARIAN",
        fileName: fileName,
        fileUrl: explicitUrl || urls.join(","),
        uploadDate: extractDate(fileName || "").toISOString(),
        isLastChunk: false, // Don't create duplicate SyncHistory record since we already have it
        totalRecords: allRows.length,
        rows: chunk
      };

      const chunkRes = await fetch(`${origin}/api/upload/chunk`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Cookie": cookies
        },
        body: JSON.stringify(payload)
      });

      if (!chunkRes.ok) {
        const err = await chunkRes.text();
        throw new Error(`Chunk ${i} failed: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil melakukan sinkronisasi file (${fileName}) dari Blob dengan total ${allRows.length} baris.`
    });

  } catch (error: any) {
    console.error("Sync latest blob error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

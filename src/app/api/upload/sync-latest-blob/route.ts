import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import * as xlsx from "xlsx";

const prisma = new PrismaClient();
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { type: typeParam, explicitUrl, explicitFileName } = await request.json();
    
    let urls: string[] = [];
    let fileName = "";
    let fileDateStr = "";

    if (explicitUrl) {
      urls = explicitUrl.split(",");
      fileName = explicitFileName || "BlobFile";
      fileDateStr = new Date().toISOString();
    } else {
      // Find latest file in SyncHistory for this type
      const latestSync = await prisma.syncHistory.findFirst({
        where: { type: typeParam || "PQ_HARIAN", fileUrl: { not: null } },
        orderBy: { createdAt: "desc" },
      });

      if (!latestSync || !latestSync.fileUrl) {
        return NextResponse.json({ success: false, error: `Belum ada file ter-upload di Blob untuk tipe ${typeParam || "PQ_HARIAN"}` }, { status: 404 });
      }
      
      urls = latestSync.fileUrl.split(",");
      fileName = latestSync.fileName || "BlobFile";
      fileDateStr = latestSync.createdAt.toISOString();
    }

    // ============================================================
    // Auto-detect type dari folder Blob URL
    // PQ/... → PQ_HARIAN, PROMO/... → UPDATE_PROMO
    // Ini lebih akurat daripada parameter manual.
    // ============================================================
    const detectTypeFromUrl = (url: string): string => {
      const urlUpper = url.toUpperCase();
      if (urlUpper.includes("/PROMO/")) return "UPDATE_PROMO";
      if (urlUpper.includes("/PQ/")) return "PQ_HARIAN";
      return typeParam || "PQ_HARIAN"; // fallback ke parameter jika ada
    };
    
    // Ambil type dari URL pertama (semua URL dalam 1 batch pasti 1 folder)
    const detectedType = urls.length > 0 ? detectTypeFromUrl(urls[0]) : (typeParam || "PQ_HARIAN");


    let totalRowsProcessed = 0;
    const origin = request.nextUrl.origin;
    const cookies = request.headers.get("cookie") || "";
    const CHUNK_SIZE = 500;

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

    for (const url of urls) {
      console.log("Downloading from blob:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Gagal download file dari Blob: " + url);

      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);

      const workbook = xlsx.read(buffer, { type: "buffer", cellDates: false });
      
      // Helper untuk mencari index baris header (yang ada SKU/KODE)
      const findHeaderRowIndex = (ws: any): number => {
        const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          const row = rows[i];
          if (!row) continue;
          const hasSKU = row.some(cell => {
            if (typeof cell !== 'string') return false;
            const c = cell.toUpperCase().trim();
            return c === "SKU" || c === "KODE PRODUK" || c === "KODE" || c === "ARTICLE" || c === "BARCODE";
          });
          if (hasSKU) return i;
        }
        return 0;
      };
      
      let fileRows: any[] = [];
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        
        const headerRowIndex = findHeaderRowIndex(ws);
        const rawRows = xlsx.utils.sheet_to_json(ws, { range: headerRowIndex, defval: "" });
        
        const rowsWithSource = rawRows.map((r: any) => ({
          ...r,
          __SOURCE_FILE__: fileName,
          __SOURCE_SHEET__: sheetName
        }));
        fileRows = fileRows.concat(rowsWithSource);
      }
      
      if (fileRows.length === 0) continue;
      totalRowsProcessed += fileRows.length;

      // Forward to /api/upload/chunk
      const totalChunks = Math.ceil(fileRows.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = fileRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const payload = {
          type: detectedType, 
          fileName: fileName,
          fileUrl: explicitUrl || urls.join(","),
          uploadDate: extractDate(fileName || "").toISOString(),
          isLastChunk: false, // Prevent multiple history logs
          totalRecords: fileRows.length,
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
          throw new Error(`Chunk ${i} failed for ${url}: ${err}`);
        }
      }
    }

    if (totalRowsProcessed === 0) {
      return NextResponse.json({ success: false, error: "File Excel/CSV kosong atau format salah" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      detectedType,
      message: `Berhasil sinkronisasi file (${fileName}) [${detectedType}] dari Blob dengan total ${totalRowsProcessed} baris.`
    });

  } catch (error: any) {
    console.error("Sync latest blob error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

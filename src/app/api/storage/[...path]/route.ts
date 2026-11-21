import { NextRequest, NextResponse } from "next/server";
import {
  getTursoStorageObjectMeta,
  readTursoStorageBuffer,
  readTursoStorageChunk,
} from "@/lib/tursoStorage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await context.params;
    const rawPath = (segments || [])
      .map((s) => decodeURIComponent(s))
      .join("/")
      .replace(/^\/+/, "");

    if (!rawPath || rawPath.includes("..")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // Proteksi ketat: folder secrets/ tidak boleh diakses dari HTTP publik
    if (rawPath.toLowerCase().startsWith("secrets/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const chunkParam = request.nextUrl.searchParams.get("chunk");
    const isImmutableSnapshot =
      rawPath.startsWith("offline-db/snapshot-") && rawPath.endsWith(".json.gz");
    const cacheHeader = isImmutableSnapshot
      ? "public, max-age=31536000, immutable"
      : "no-store";

    // Jalur Kilat 1-Query untuk chunk snapshot immutable (bebas extra meta query + langsung di-cache Vercel Edge CDN!)
    if (chunkParam !== null && isImmutableSnapshot) {
      const idx = parseInt(chunkParam, 10);
      if (isNaN(idx) || idx < 0 || idx > 200) {
        return NextResponse.json({ error: "Chunk index di luar batas" }, { status: 400 });
      }
      const chunkBuf = await readTursoStorageChunk(rawPath, idx);
      if (!chunkBuf) {
        return NextResponse.json({ error: "Chunk tidak ditemukan" }, { status: 404 });
      }
      return new NextResponse(new Uint8Array(chunkBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Length": String(chunkBuf.length),
          "X-Chunk-Index": String(idx),
          "Cache-Control": cacheHeader,
          "CDN-Cache-Control": cacheHeader,
          "Vercel-CDN-Cache-Control": cacheHeader,
        },
      });
    }

    const meta = await getTursoStorageObjectMeta(rawPath);
    if (!meta) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
    }

    // Mode chunk presisi (1.5 MB/request — 100% bebas batas payload 4.5 MB Vercel)
    if (chunkParam !== null) {
      const idx = parseInt(chunkParam, 10);
      if (isNaN(idx) || idx < 0 || idx >= meta.chunkCount) {
        return NextResponse.json({ error: "Chunk index di luar batas" }, { status: 400 });
      }
      const chunkBuf = await readTursoStorageChunk(rawPath, idx);
      if (!chunkBuf) {
        return NextResponse.json({ error: "Chunk tidak ditemukan" }, { status: 404 });
      }
      return new NextResponse(new Uint8Array(chunkBuf), {
        status: 200,
        headers: {
          "Content-Type": meta.contentType || "application/octet-stream",
          "Content-Length": String(chunkBuf.length),
          "X-Total-Size": String(meta.sizeBytes),
          "X-Chunk-Count": String(meta.chunkCount),
          "X-Chunk-Index": String(idx),
          "Cache-Control": cacheHeader,
        },
      });
    }

    // Jika file kecil (1 chunk <= 3.5 MB), kembalikan langsung
    if (meta.chunkCount <= 1) {
      const full = await readTursoStorageBuffer(rawPath);
      if (!full) {
        return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
      }
      return new NextResponse(new Uint8Array(full.buffer), {
        status: 200,
        headers: {
          "Content-Type": full.contentType || "application/octet-stream",
          "Content-Length": String(full.buffer.length),
          "X-Chunk-Count": "1",
          "Cache-Control": cacheHeader,
        },
      });
    }

    // File multi-chunk: alirkan bertahap via ReadableStream
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let i = 0; i < meta.chunkCount; i++) {
            const buf = await readTursoStorageChunk(rawPath, i);
            if (!buf) throw new Error(`Missing chunk ${i}`);
            controller.enqueue(new Uint8Array(buf));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": meta.contentType || "application/octet-stream",
        "Content-Length": String(meta.sizeBytes),
        "X-Chunk-Count": String(meta.chunkCount),
        "Cache-Control": cacheHeader,
      },
    });
  } catch (error: any) {
    console.error("[TURSO-STORAGE GET] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

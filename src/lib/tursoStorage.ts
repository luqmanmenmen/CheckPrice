import { prisma } from "@/lib/prisma";

const CHUNK_RAW_BYTES = 1_500_000; // 1.5 MB raw -> ~2.0 MB base64 (aman jauh di bawah batas 4.5 MB Vercel)

function cleanStoragePath(p: string): string {
  return String(p || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

async function toBuffer(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (typeof data === "string") return Buffer.from(data, "utf-8");
  if (data && typeof (data as Blob).arrayBuffer === "function") {
    const ab = await (data as Blob).arrayBuffer();
    return Buffer.from(new Uint8Array(ab));
  }
  return Buffer.from(String(data ?? ""), "utf-8");
}

export async function writeTursoStorage(
  rawPath: string,
  data: unknown,
  contentType: string = "application/octet-stream"
): Promise<{ path: string; sizeBytes: number; chunkCount: number }> {
  const path = cleanStoragePath(rawPath);
  const buf = await toBuffer(data);
  const chunks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += CHUNK_RAW_BYTES) {
    chunks.push(buf.subarray(i, Math.min(buf.length, i + CHUNK_RAW_BYTES)));
  }
  if (chunks.length === 0) chunks.push(Buffer.alloc(0));

  await prisma.storageChunk.deleteMany({ where: { path } });
  for (let idx = 0; idx < chunks.length; idx++) {
    await prisma.storageChunk.create({
      data: {
        path,
        chunkIndex: idx,
        dataBase64: chunks[idx].toString("base64"),
      },
    });
  }

  await prisma.storageObject.upsert({
    where: { path },
    update: {
      contentType,
      sizeBytes: buf.length,
      chunkCount: chunks.length,
      updatedAt: new Date(),
    },
    create: {
      path,
      contentType,
      sizeBytes: buf.length,
      chunkCount: chunks.length,
      updatedAt: new Date(),
    },
  });

  return { path, sizeBytes: buf.length, chunkCount: chunks.length };
}

export async function getTursoStorageObjectMeta(rawPath: string) {
  const path = cleanStoragePath(rawPath);
  return prisma.storageObject.findUnique({ where: { path } });
}

export async function readTursoStorageChunk(rawPath: string, chunkIndex: number): Promise<Buffer | null> {
  const path = cleanStoragePath(rawPath);
  const row = await prisma.storageChunk.findUnique({
    where: { path_chunkIndex: { path, chunkIndex } },
    select: { dataBase64: true },
  });
  if (!row) return null;
  return Buffer.from(row.dataBase64, "base64");
}

export async function readTursoStorageBuffer(rawPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const path = cleanStoragePath(rawPath);
  const meta = await prisma.storageObject.findUnique({ where: { path } });
  if (!meta) return null;
  const rows = await prisma.storageChunk.findMany({
    where: { path },
    orderBy: { chunkIndex: "asc" },
    select: { dataBase64: true },
  });
  if (rows.length === 0) return null;
  const parts = rows.map((r) => Buffer.from(r.dataBase64, "base64"));
  return {
    buffer: Buffer.concat(parts),
    contentType: meta.contentType || "application/octet-stream",
  };
}

export async function readTursoStorageText(rawPath: string): Promise<string | null> {
  const res = await readTursoStorageBuffer(rawPath);
  return res ? res.buffer.toString("utf-8") : null;
}

export async function readTursoStorageJson<T = any>(rawPath: string): Promise<T | null> {
  try {
    const text = await readTursoStorageText(rawPath);
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export async function listTursoStorage(prefix: string = "") {
  const cleanPrefix = cleanStoragePath(prefix).replace(/\/+$/, "");
  const likePrefix = cleanPrefix ? `${cleanPrefix}/` : "";
  const objs = await prisma.storageObject.findMany({
    where: likePrefix ? { path: { startsWith: likePrefix } } : undefined,
    orderBy: { updatedAt: "desc" },
  });

  // Emulasi struktur folder & file seperti Storage list(folder)
  const directMap = new Map<
    string,
    { name: string; id: string | null; updated_at: string; created_at: string; metadata: { size: number; mimetype: string } | null }
  >();

  for (const obj of objs) {
    const rel = likePrefix ? obj.path.slice(likePrefix.length) : obj.path;
    if (!rel) continue;
    const slashIdx = rel.indexOf("/");
    if (slashIdx === -1) {
      directMap.set(rel, {
        name: rel,
        id: obj.path,
        updated_at: obj.updatedAt.toISOString(),
        created_at: obj.updatedAt.toISOString(),
        metadata: { size: obj.sizeBytes, mimetype: obj.contentType },
      });
    } else {
      const folderName = rel.slice(0, slashIdx);
      if (!directMap.has(folderName)) {
        directMap.set(folderName, {
          name: folderName,
          id: null,
          updated_at: obj.updatedAt.toISOString(),
          created_at: obj.updatedAt.toISOString(),
          metadata: null,
        });
      }
    }
  }

  return Array.from(directMap.values());
}

export async function removeTursoStorage(paths: string[]): Promise<number> {
  const cleanPaths = paths.map(cleanStoragePath).filter(Boolean);
  if (cleanPaths.length === 0) return 0;
  await prisma.storageChunk.deleteMany({ where: { path: { in: cleanPaths } } });
  const res = await prisma.storageObject.deleteMany({ where: { path: { in: cleanPaths } } });
  return res.count;
}

export function getTursoPublicUrl(rawPath: string): string {
  const clean = cleanStoragePath(rawPath);
  const encoded = clean
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/storage/${encoded}`;
}

/**
 * Drop-in adapter 100% berbasis Turso Cloud untuk seluruh panggilan `.storage.from(...)`
 * di Next.js API routes (0% ketergantungan Supabase).
 */
export const tursoStorageClient = {
  storage: {
    from(_bucket: string) {
      return {
        async upload(path: string, data: unknown, options?: { contentType?: string; upsert?: boolean; cacheControl?: string }) {
          try {
            const ct = options?.contentType || "application/octet-stream";
            const saved = await writeTursoStorage(path, data, ct);
            return { data: { path: saved.path }, error: null };
          } catch (error: any) {
            return { data: null, error };
          }
        },
        async download(path: string) {
          try {
            const res = await readTursoStorageBuffer(path);
            if (!res) {
              return { data: null, error: new Error(`Object not found: ${path}`) };
            }
            const blob = new Blob([new Uint8Array(res.buffer)], { type: res.contentType });
            return { data: blob, error: null };
          } catch (error: any) {
            return { data: null, error };
          }
        },
        async list(prefix: string = "", _options?: any) {
          try {
            const items = await listTursoStorage(prefix);
            return { data: items, error: null };
          } catch (error: any) {
            return { data: null, error };
          }
        },
        async remove(paths: string[]) {
          try {
            await removeTursoStorage(paths);
            return { data: paths.map((name) => ({ name })), error: null };
          } catch (error: any) {
            return { data: null, error };
          }
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: getTursoPublicUrl(path) } };
        },
      };
    },
  },
};

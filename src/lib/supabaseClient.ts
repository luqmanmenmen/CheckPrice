/**
 * src/lib/supabaseClient.ts
 * Aliran Supabase diputus 100% — seluruh operasi storage kini dialihkan murni ke Turso Cloud (`StorageObject` / `StorageChunk`).
 */
import { tursoStorageClient } from "@/lib/tursoStorage";

export const supabase = tursoStorageClient;
export default tursoStorageClient;

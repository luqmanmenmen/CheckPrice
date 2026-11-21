import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const JSON_ARRAY_FIELDS = new Set(["images", "articleColors", "articleSizes"]);

export function parseJsonStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "{}") return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

function serializeArrayFieldsInPlace(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) serializeArrayFieldsInPlace(obj[i]);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (JSON_ARRAY_FIELDS.has(key) && Array.isArray(val)) {
      obj[key] = JSON.stringify(val);
    } else if (val && typeof val === "object" && !(val instanceof Date)) {
      serializeArrayFieldsInPlace(val);
    }
  }
  return obj;
}

function hydrateArrayFieldsInPlace(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) hydrateArrayFieldsInPlace(obj[i]);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (JSON_ARRAY_FIELDS.has(key) && typeof val === "string") {
      obj[key] = parseJsonStringArray(val);
    } else if (val && typeof val === "object" && !(val instanceof Date)) {
      hydrateArrayFieldsInPlace(val);
    }
  }
  return obj;
}

function createPrismaClient() {
  const tursoUrl = (process.env.TURSO_DATABASE_URL || "").trim();
  const tursoToken = (process.env.TURSO_AUTH_TOKEN || "").trim();

  let baseClient: PrismaClient;
  if (tursoUrl) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: tursoToken || undefined,
    });
    const adapter = new PrismaLibSQL(libsql);
    baseClient = new PrismaClient({ adapter });
  } else {
    // Fallback aman saat static build tanpa env Turso
    baseClient = new PrismaClient();
  }

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (
            args &&
            (operation === "create" ||
              operation === "createMany" ||
              operation === "update" ||
              operation === "updateMany" ||
              operation === "upsert")
          ) {
            serializeArrayFieldsInPlace(args);
          }
          const result = await query(args);
          if (result && typeof result === "object") {
            hydrateArrayFieldsInPlace(result);
          }
          return result;
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma || createPrismaClient();

// Selalu simpan instance di globalThis agar tidak membuat koneksi baru berulang kali di Vercel/Node
globalForPrisma.prisma = prisma;

export default prisma;

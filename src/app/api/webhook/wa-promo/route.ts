import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeTursoStorage, getTursoPublicUrl } from "@/lib/tursoStorage";
import { dispatchToGitHubRunner } from "@/lib/githubDispatcher";

export const dynamic = "force-dynamic";

const ALLOWED_EXT_RE = /\.(xlsx|xls|csv|xlsm|xlsb)$/i;

function getExpectedSecret(): string {
  return (
    process.env.WA_CS_SECRET ||
    process.env.WEBHOOK_SECRET ||
    "B4mb4ng123!Aman"
  ).trim();
}

function isAuthorized(req: NextRequest): boolean {
  const provided = (
    req.headers.get("x-wa-cs-secret") ||
    req.headers.get("x-webhook-token") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
  const expected = getExpectedSecret();
  return Boolean(provided && expected && provided === expected);
}

function sanitizeSegment(raw: string, fallback: string): string {
  const clean = String(raw || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\.\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

/**
 * POST /api/webhook/wa-promo
 * Thin Gateway (0% parsing berat di Vercel) untuk fitur Auto-Update Promo via WhatsApp Bridge:
 *  - Mode 1 (multipart/form-data): Upload 1 file Excel promo ke Turso Storage (`PROMO/<folder>/<fileName>`)
 *  - Mode 2 (application/json): Trigger GitHub Actions Python Runner:
 *      * promoMode === "upcoming" ("update promo 719 h-") -> action: "upcoming-promo" (After Promo / Persiapan POP, Read-Only DB kasir)
 *      * promoMode === "direct"   ("update promo 719")    -> action: "promo"          (Direct Langsung hari ini)
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized WA Promo Webhook" },
      { status: 401 }
    );
  }

  try {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    // ─── MODE 1: UPLOAD FILE EXCEL KE TURSO STORAGE ─────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const rawFolder = String(formData.get("folder") || "").trim();
      const rawFileName = String(formData.get("fileName") || file?.name || "").trim();

      if (!file) {
        return NextResponse.json(
          { success: false, error: "File Excel wajib disertakan." },
          { status: 400 }
        );
      }

      const safeFileName = sanitizeSegment(rawFileName, `wa_promo_${Date.now()}.xlsx`);
      if (!ALLOWED_EXT_RE.test(safeFileName)) {
        return NextResponse.json(
          {
            success: false,
            error: `Format file tidak didukung (${safeFileName}). Gunakan .xlsx, .xls, atau .csv.`,
          },
          { status: 400 }
        );
      }

      const safeFolder = sanitizeSegment(rawFolder, `WA_DIRECT_${new Date().toISOString().slice(0, 10)}`);
      const storagePath = `PROMO/${safeFolder}/${safeFileName}`;
      const buf = Buffer.from(await file.arrayBuffer());

      if (buf.length === 0) {
        return NextResponse.json(
          { success: false, error: "File Excel kosong (0 bytes)." },
          { status: 400 }
        );
      }

      const mime =
        file.type ||
        (safeFileName.toLowerCase().endsWith(".csv")
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const saved = await writeTursoStorage(storagePath, buf, mime);
      return NextResponse.json({
        success: true,
        path: saved.path,
        tursoUri: `turso://${saved.path}`,
        publicUrl: getTursoPublicUrl(saved.path),
        fileName: safeFileName,
        sizeBytes: saved.sizeBytes,
      });
    }

    // ─── MODE 2: DISPATCH GITHUB ACTIONS PYTHON RUNNER ──────────────────────
    const body = await req.json().catch(() => ({}));
    const promoMode = String(body.promoMode || "").trim().toLowerCase();
    const rawFolder = String(body.folder || "").trim();
    const fileCount = Math.max(1, Number(body.fileCount || 1));

    if (!rawFolder) {
      return NextResponse.json(
        { success: false, error: "Nama folder batch promo wajib diisi." },
        { status: 400 }
      );
    }

    const safeFolder = sanitizeSegment(rawFolder, "");
    const isUpcoming = promoMode === "upcoming";
    const action = isUpcoming ? "upcoming-promo" : "promo";
    const promoUrl = `turso://PROMO/${safeFolder}`;

    const supervisor = await prisma.user
      .findFirst({
        where: { OR: [{ nik: "22054178" }, { role: "SUPERVISOR" }] },
        select: { id: true },
      })
      .catch(() => null);

    const dispatched = await dispatchToGitHubRunner({
      action,
      force: true,
      promoUrl,
      userId: supervisor?.id || null,
    });

    return NextResponse.json(
      {
        ...dispatched.payload,
        promoMode: isUpcoming ? "upcoming" : "direct",
        folder: safeFolder,
        promoUrl,
        fileCount,
      },
      { status: dispatched.status }
    );
  } catch (err: any) {
    console.error("[WA-PROMO WEBHOOK]", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal memproses upload promo WhatsApp" },
      { status: 500 }
    );
  }
}

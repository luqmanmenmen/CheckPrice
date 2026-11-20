import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const TARGET_STORAGE_PATH = "analytics/store-target.json";
const DEFAULT_TARGET_MTD = 2_000_000_000; // Default Rp 2 Miliar

type StoreTargetConfig = {
  targetMtd: number;
  updatedBy: string;
  updatedAt: string;
};

let cachedTarget: { config: StoreTargetConfig; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function getCurrentSessionUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const legacySessionId = cookieStore.get("sessionId")?.value;

    if (token) {
      const session = await verifyToken(token);
      if (session?.userId) {
        return await prisma.user.findUnique({
          where: { id: session.userId },
          select: { id: true, nik: true, name: true, role: true },
        });
      }
    } else if (legacySessionId) {
      return await prisma.user.findFirst({
        where: { sessionId: legacySessionId, status: "ACTIVE" },
        select: { id: true, nik: true, name: true, role: true },
      });
    }
  } catch {}
  return null;
}

function isSpvOrDev(user: { role?: string; nik?: string } | null): boolean {
  if (!user) return false;
  return user.role === "SUPERVISOR" || user.nik === "22054178";
}

async function readStoreTargetFromStorage(): Promise<StoreTargetConfig> {
  const now = Date.now();
  if (cachedTarget && now - cachedTarget.fetchedAt < CACHE_TTL_MS) {
    return cachedTarget.config;
  }

  const supaUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (supaUrl) {
    try {
      const res = await fetch(
        `${supaUrl}/storage/v1/object/public/excel-uploads/${TARGET_STORAGE_PATH}?t=${Date.now()}`,
        { cache: "no-store", signal: AbortSignal.timeout(3500) }
      );
      if (res.ok) {
        const json = await res.json();
        const val = Number(json?.targetMtd || 0);
        if (val >= 10_000_000) {
          const cfg: StoreTargetConfig = {
            targetMtd: val,
            updatedBy: String(json.updatedBy || "SPV / Developer"),
            updatedAt: String(json.updatedAt || ""),
          };
          cachedTarget = { config: cfg, fetchedAt: now };
          return cfg;
        }
      }
    } catch {}
  }

  return (
    cachedTarget?.config || {
      targetMtd: DEFAULT_TARGET_MTD,
      updatedBy: "Default Sistem",
      updatedAt: "",
    }
  );
}

export async function GET() {
  const [config, user] = await Promise.all([
    readStoreTargetFromStorage(),
    getCurrentSessionUser(),
  ]);

  return NextResponse.json(
    {
      success: true,
      targetMtd: config.targetMtd,
      updatedBy: config.updatedBy,
      updatedAt: config.updatedAt,
      canEdit: isSpvOrDev(user),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Silakan login terlebih dahulu." }, { status: 401 });
    }
    if (!isSpvOrDev(user)) {
      return NextResponse.json(
        { success: false, error: "Khusus Supervisor (SPV) atau Developer yang dapat mengubah target toko." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawTarget = Number(body.targetMtd);
    if (!Number.isFinite(rawTarget) || rawTarget < 10_000_000 || rawTarget > 500_000_000_000) {
      return NextResponse.json(
        { success: false, error: "Target toko harus di antara Rp 10 juta hingga Rp 500 Miliar." },
        { status: 400 }
      );
    }

    const cleanTarget = Math.round(rawTarget);
    const cfg: StoreTargetConfig = {
      targetMtd: cleanTarget,
      updatedBy: `${user.name} (${user.nik === "22054178" ? "Developer" : "SPV"})`,
      updatedAt: new Date().toISOString(),
    };

    const payloadBytes = Buffer.from(JSON.stringify(cfg), "utf-8");
    const { error } = await supabase.storage
      .from("excel-uploads")
      .upload(TARGET_STORAGE_PATH, payloadBytes, {
        contentType: "application/json",
        cacheControl: "60",
        upsert: true,
      });

    if (error) {
      return NextResponse.json(
        { success: false, error: `Gagal menyimpan target ke server: ${error.message}` },
        { status: 500 }
      );
    }

    cachedTarget = { config: cfg, fetchedAt: Date.now() };
    return NextResponse.json({
      success: true,
      targetMtd: cfg.targetMtd,
      updatedBy: cfg.updatedBy,
      updatedAt: cfg.updatedAt,
      canEdit: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal memperbarui target toko." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readTursoStorageJson } from "@/lib/tursoStorage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PromoSyncStatusPayload {
  success: boolean;
  status: "running" | "completed" | "failed" | "idle";
  syncKey: string;
  promoName: string;
  stageLabel: string;
  latestLogLine: string;
  percent: number;
  stepIndex: number;
  totalSteps: number;
  recordsUpdated: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  elapsedSeconds: number;
}

let cachedStatus: { payload: PromoSyncStatusPayload; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 4000;

const PROMO_ACTIONS = new Set(["promo", "upcoming-promo", "all"]);
const PROMO_HISTORY_TYPES = ["UPDATE_PROMO", "PROMO_MINGGUAN"];

function cleanPromoDisplayName(raw?: string | null): string {
  const s = String(raw || "")
    .replace(/(?:https?:\/\/)?storehub\.mdsretailing\.id[^\s"']*/gi, "luqman.org")
    .replace(/(?:https?:\/\/)?(?:www\.)?matahari\.com/gi, "luqman.org")
    .replace(/(?:https?:\/\/)?cdn\.shopify\.com[^\s"']*/gi, "luqman.org")
    .replace(/MDS\s*(?:[-]?\s*BISA|Retailing|RETAIL)/gi, "luqman.org")
    .replace(/\bMDS\b/gi, "luqman.org")
    .replace(/\bStoreHub\b/gi, "luqman.org")
    .replace(/\bMatahari\b/gi, "luqman.org")
    .replace(/\bShopify\b/gi, "luqman.org")
    .replace(/\bM223515\b|\bM223708\b/gi, "server")
    .trim();
  return s || "Update Promo Terbaru";
}

function resolvePromoStageProgress(
  currentStep: string,
  lines: Array<{ text?: string; step?: string }>
): { percent: number; stepIndex: number; stageLabel: string; latestLine: string } {
  const stepLower = String(currentStep || "").toLowerCase();
  const lastMeaningful =
    [...lines]
      .reverse()
      .find((l) => {
        const t = String(l?.text || "").trim();
        return t && !t.startsWith("▶️") && !t.startsWith("===");
      })?.text || "";

  if (stepLower.includes("kategori 5") || stepLower.includes("analytics")) {
    return {
      percent: 92,
      stepIndex: 3,
      stageLabel: "Finalisasi laporan promo & pembersihan promo kedaluwarsa...",
      latestLine: lastMeaningful,
    };
  }
  if (stepLower.includes("kategori 4") || stepLower.includes("catalog") || stepLower.includes("snapshot")) {
    const isSnap = lines.some((l) => String(l?.text || "").includes("[SNAPSHOT]"));
    return {
      percent: isSnap ? 82 : 68,
      stepIndex: 2,
      stageLabel: isSnap
        ? "Mengompilasi paket katalog offline HP kasir..."
        : "Menyusun ulang Katalog Produk dengan harga promo terbaru...",
      latestLine: lastMeaningful,
    };
  }
  if (stepLower.includes("kategori 3") || stepLower.includes("kategori 6") || stepLower.includes("promo")) {
    const chunkHits = lines.filter((l) => String(l?.text || "").includes("[Chunk")).length;
    const pct = Math.min(58, 24 + chunkHits * 5);
    return {
      percent: pct,
      stepIndex: 1,
      stageLabel: "Membaca file Excel & memperbarui harga promo di Turso Cloud...",
      latestLine: lastMeaningful,
    };
  }
  return {
    percent: 16,
    stepIndex: 1,
    stageLabel: "Menyiapkan mesin update promo di server...",
    latestLine: lastMeaningful,
  };
}

export async function GET() {
  const now = Date.now();
  if (cachedStatus && now - cachedStatus.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedStatus.payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const [liveMarker, runnerLog, recentPromoSyncs] = await Promise.all([
      readTursoStorageJson<any>("logs/promo-sync-live.json"),
      readTursoStorageJson<any>("logs/live-runner-log.json"),
      prisma.syncHistory
        .findMany({
          where: { type: { in: PROMO_HISTORY_TYPES } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            type: true,
            fileName: true,
            status: true,
            records: true,
            createdAt: true,
          },
        })
        .catch(() => [] as any[]),
    ]);

    const latestCompleted = recentPromoSyncs.find((s) => s.status === "SUCCESS") || null;
    const latestCompletedMs = latestCompleted ? new Date(latestCompleted.createdAt).getTime() : 0;

    // 1. Cek apakah GitHub Runner sedang aktif menjalankan promo
    const runnerAction = String(runnerLog?.action || "").toLowerCase();
    const runnerStatus = String(runnerLog?.status || "").toLowerCase();
    const runnerUpdatedMs = runnerLog?.updatedAt ? new Date(runnerLog.updatedAt).getTime() : 0;
    const runnerStartedMs = runnerLog?.startedAt ? new Date(runnerLog.startedAt).getTime() : runnerUpdatedMs;
    const runnerIsFresh = runnerUpdatedMs > 0 && now - runnerUpdatedMs < 20 * 60 * 1000;

    if (PROMO_ACTIONS.has(runnerAction) && runnerStatus === "running" && runnerIsFresh) {
      const lines = Array.isArray(runnerLog?.lines) ? runnerLog.lines : [];
      const prog = resolvePromoStageProgress(String(runnerLog?.currentStep || ""), lines);
      const markerName =
        liveMarker?.triggeredAt && Math.abs(runnerStartedMs - new Date(liveMarker.triggeredAt).getTime()) < 30 * 60 * 1000
          ? String(liveMarker.promoName || "")
          : "";
      const payload: PromoSyncStatusPayload = {
        success: true,
        status: "running",
        syncKey: `run_${runnerLog.runId || runnerStartedMs}`,
        promoName: cleanPromoDisplayName(markerName || "Update Promo Otomatis"),
        stageLabel: prog.stageLabel,
        latestLogLine: prog.latestLine,
        percent: prog.percent,
        stepIndex: prog.stepIndex,
        totalSteps: 3,
        recordsUpdated: 0,
        startedAt: runnerLog.startedAt || null,
        completedAt: null,
        updatedAt: runnerLog.updatedAt || null,
        elapsedSeconds: Math.max(1, Math.round((now - runnerStartedMs) / 1000)),
      };
      cachedStatus = { payload, fetchedAt: now };
      return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    // 2. Cek apakah file promo baru saja masuk dari Email/GAS/Upload (queued menunggu runner boot)
    const markerTriggeredMs = liveMarker?.triggeredAt ? new Date(liveMarker.triggeredAt).getTime() : 0;
    const runnerFinishedAfterMarker =
      PROMO_ACTIONS.has(runnerAction) &&
      runnerStatus === "completed" &&
      runnerUpdatedMs > markerTriggeredMs;
    const markerIsQueued =
      liveMarker?.status === "queued" &&
      markerTriggeredMs > 0 &&
      now - markerTriggeredMs < 8 * 60 * 1000 &&
      latestCompletedMs < markerTriggeredMs &&
      !runnerFinishedAfterMarker;

    if (markerIsQueued) {
      const elapsedSec = Math.max(1, Math.round((now - markerTriggeredMs) / 1000));
      const dynamicPct = Math.min(20, Number(liveMarker?.percent || 10) + Math.floor(elapsedSec / 8));
      const payload: PromoSyncStatusPayload = {
        success: true,
        status: "running",
        syncKey: `queued_${markerTriggeredMs}`,
        promoName: cleanPromoDisplayName(liveMarker?.promoName || "Promo Baru dari Email"),
        stageLabel: String(
          liveMarker?.stageLabel || "Promo baru diterima Turso — menyiapkan mesin sinkronisasi..."
        ),
        latestLogLine: "Menunggu runner Python aktif di GitHub Actions...",
        percent: dynamicPct,
        stepIndex: 1,
        totalSteps: 3,
        recordsUpdated: 0,
        startedAt: liveMarker.triggeredAt,
        completedAt: null,
        updatedAt: liveMarker.updatedAt || liveMarker.triggeredAt,
        elapsedSeconds: elapsedSec,
      };
      cachedStatus = { payload, fetchedAt: now };
      return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    // 3. Cek jika promo runner baru saja gagal (< 20 menit)
    if (
      PROMO_ACTIONS.has(runnerAction) &&
      runnerStatus === "failed" &&
      runnerUpdatedMs > 0 &&
      now - runnerUpdatedMs < 20 * 60 * 1000
    ) {
      const payload: PromoSyncStatusPayload = {
        success: true,
        status: "failed",
        syncKey: `fail_${runnerLog.runId || runnerUpdatedMs}`,
        promoName: cleanPromoDisplayName(liveMarker?.promoName || "Update Promo"),
        stageLabel: "Proses update promo terhenti — silakan cek halaman Sinkronisasi Harian.",
        latestLogLine: String(runnerLog?.currentStep || ""),
        percent: 100,
        stepIndex: 3,
        totalSteps: 3,
        recordsUpdated: 0,
        startedAt: runnerLog.startedAt || null,
        completedAt: runnerLog.updatedAt || null,
        updatedAt: runnerLog.updatedAt || null,
        elapsedSeconds: 0,
      };
      cachedStatus = { payload, fetchedAt: now };
      return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    // 4. Tampilkan status promo terakhir yang SUDAH MASUK (baik yang baru selesai maupun yang sudah tersedia saat user login)
    if (latestCompleted) {
      const payload: PromoSyncStatusPayload = {
        success: true,
        status: "completed",
        syncKey: `done_${latestCompleted.id}`,
        promoName: cleanPromoDisplayName(latestCompleted.fileName),
        stageLabel: "Update promo terbaru sudah masuk & aktif di Turso Cloud.",
        latestLogLine: "",
        percent: 100,
        stepIndex: 3,
        totalSteps: 3,
        recordsUpdated: Number(latestCompleted.records || 0),
        startedAt: null,
        completedAt: new Date(latestCompleted.createdAt).toISOString(),
        updatedAt: new Date(latestCompleted.createdAt).toISOString(),
        elapsedSeconds: 0,
      };
      cachedStatus = { payload, fetchedAt: now };
      return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    const idlePayload: PromoSyncStatusPayload = {
      success: true,
      status: "idle",
      syncKey: "idle",
      promoName: "",
      stageLabel: "",
      latestLogLine: "",
      percent: 0,
      stepIndex: 0,
      totalSteps: 3,
      recordsUpdated: 0,
      startedAt: null,
      completedAt: null,
      updatedAt: null,
      elapsedSeconds: 0,
    };
    cachedStatus = { payload: idlePayload, fetchedAt: now };
    return NextResponse.json(idlePayload, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, status: "idle", error: err?.message || "Gagal memeriksa status promo" },
      { status: 200 }
    );
  }
}

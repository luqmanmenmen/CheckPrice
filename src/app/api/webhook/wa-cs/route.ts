import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function normalizeOrigin(raw: string): string {
  const clean = raw.trim().replace(/\/+$/, "");
  if (clean === "https://luqmanganteng.my.id" || clean === "http://luqmanganteng.my.id") {
    return "https://www.luqmanganteng.my.id";
  }
  return clean;
}

function resolvePyWaCsEndpoint(requestUrl?: string): string {
  if (requestUrl) {
    try {
      const u = new URL(requestUrl);
      if (u.origin && !u.origin.includes("localhost") && !u.origin.includes("127.0.0.1")) {
        return `${normalizeOrigin(u.origin)}/api/py_wa_cs`;
      }
    } catch {}
  }
  return "https://www.luqmanganteng.my.id/api/py_wa_cs";
}

function getWaCsSecret(): string {
  return (
    process.env.WA_CS_SECRET ||
    process.env.WEBHOOK_SECRET ||
    "B4mb4ng123!Aman"
  ).trim();
}

async function callPythonWaCs(req: NextRequest, payload: Record<string, unknown>, timeoutMs = 22000) {
  const res = await fetch(resolvePyWaCsEndpoint(req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-WA-CS-Secret": getWaCsSecret(),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json();
}

/**
 * GET /api/webhook/wa-cs — Cek kesiapan webhook (untuk verifikasi Fonnte / Gateway)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "SUKO & Mu+Ku Auto CS WhatsApp Webhook",
    supports: ["fonnte", "wablas", "wa-cs-bridge"],
  });
}

/**
 * POST /api/webhook/wa-cs
 * Mendukung payload Fonnte (JSON / form-urlencoded) & custom WA gateway.
 * Jika `fonnteToken` tersimpan di konfigurasi Turso, otomatis membalas teks + foto HD via Fonnte API!
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let rawBody: Record<string, any> = {};

    if (contentType.includes("application/json")) {
      rawBody = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      rawBody = Object.fromEntries(params.entries());
    } else {
      const text = await req.text();
      try {
        rawBody = JSON.parse(text);
      } catch {
        rawBody = {};
      }
    }

    const message = String(rawBody.message || rawBody.text || rawBody.pesan || "").trim();
    if (!message) {
      return NextResponse.json({ ok: true, ignored: true, reason: "EMPTY_MESSAGE" });
    }

    // Normalisasi format Fonnte vs generic gateway
    const senderRaw = String(rawBody.sender || rawBody.from || rawBody.phone || "").trim();
    const memberRaw = String(rawBody.member || rawBody.participant || "").trim();
    const isGroup =
      rawBody.isgroup === true ||
      rawBody.isgroup === "true" ||
      rawBody.isGroup === true ||
      senderRaw.endsWith("@g.us") ||
      Boolean(rawBody.groupId);

    const groupId = isGroup ? String(rawBody.groupId || senderRaw) : "";
    const groupName = String(rawBody.groupName || rawBody.group_name || rawBody.subject || groupId).trim();
    const senderName = String(rawBody.name || rawBody.pushname || rawBody.senderName || "Kak").trim();
    const fromMe = Boolean(rawBody.fromMe === true || rawBody.fromMe === "true");

    const aiRes = await callPythonWaCs(req, {
      action: "incoming",
      source: rawBody.source || "FONNTE_WEBHOOK",
      message,
      sender: memberRaw || senderRaw,
      senderName,
      groupId,
      groupName,
      isGroup,
      fromMe,
    });

    // Jika harus membalas & ini datang dari Fonnte (bukan bridge lokal yang kirim sendiri)
    if (aiRes?.shouldReply && aiRes?.replyText && rawBody.source !== "WA_BRIDGE") {
      const cfgRes = await callPythonWaCs(req, {
        action: "get-config",
        includeLogs: false,
        includeFonnteToken: true,
      }, 6000).catch(() => null);

      const fonnteToken = String(cfgRes?.fonnteToken || process.env.FONNTE_TOKEN || "").trim();
      const target = groupId || senderRaw;

      if (fonnteToken && target) {
        const cards: Array<{ text?: string; imageUrl?: string | null }> =
          Array.isArray(aiRes.replyMessages) && aiRes.replyMessages.length > 0
            ? aiRes.replyMessages
            : [{ text: aiRes.replyText, imageUrl: aiRes.imageUrl || null }];

        for (const card of cards) {
          const form = new FormData();
          form.append("target", target);
          form.append("message", String(card.text || ""));
          if (card.imageUrl) {
            form.append("url", String(card.imageUrl));
          }
          form.append("delay", "2");

          await fetch("https://api.fonnte.com/send", {
            method: "POST",
            headers: { Authorization: fonnteToken },
            body: form,
            signal: AbortSignal.timeout(10000),
          }).catch(() => null);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      shouldReply: Boolean(aiRes?.shouldReply),
      reason: aiRes?.reason || "PROCESSED",
      replyText: aiRes?.replyText || null,
      imageUrl: aiRes?.imageUrl || null,
      elapsedMs: aiRes?.elapsedMs || 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Webhook error" },
      { status: 500 }
    );
  }
}

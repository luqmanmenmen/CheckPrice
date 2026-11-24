import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

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
  const prod = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (prod && prod.startsWith("http")) {
    return `${normalizeOrigin(prod)}/api/py_wa_cs`;
  }
  const vercelUrl = (process.env.VERCEL_URL || "").trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "")}/api/py_wa_cs`;
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

async function authorizeAdmin(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("token")?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  if (!payload) return false;
  return payload.role === "SUPERVISOR" || payload.nik === "22054178";
}

async function callPythonWaCs(req: NextRequest, body: Record<string, unknown>, timeoutMs = 15000) {
  const endpoint = resolvePyWaCsEndpoint(req.url);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-WA-CS-Secret": getWaCsSecret(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return {
      status: res.status || 502,
      data: {
        success: false,
        error: `Python WA CS Engine HTTP ${res.status}`,
        raw: text.slice(0, 180),
      },
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorizeAdmin(req))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const { status, data } = await callPythonWaCs(req, {
      action: "get-config",
      includeLogs: true,
    });
    return NextResponse.json(data, { status: status >= 200 && status < 600 ? status : 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal menghubungi Python WA CS Engine" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorizeAdmin(req))) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const allowedActions = new Set([
      "get-config",
      "save-config",
      "toggle",
      "upsert-group",
      "remove-group",
      "clear-logs",
      "simulate",
    ]);
    const action = String(body?.action || "").trim().toLowerCase();
    if (!allowedActions.has(action)) {
      return NextResponse.json({ success: false, error: "Action tidak dikenali" }, { status: 400 });
    }
    const { status, data } = await callPythonWaCs(req, body, action === "simulate" ? 22000 : 12000);
    return NextResponse.json(data, { status: status >= 200 && status < 600 ? status : 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal memproses permintaan WA CS" },
      { status: 500 }
    );
  }
}

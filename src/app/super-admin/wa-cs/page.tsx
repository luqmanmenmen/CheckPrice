"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Power,
  ShieldCheck,
  Clock,
  Users,
  Send,
  Sparkles,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Terminal,
  Cloud,
  Image as ImageIcon,
  MessageSquare,
  AlertTriangle,
  Lock,
  Loader2,
  KeyRound,
  Smartphone,
  Wifi,
  WifiOff,
  Unlink,
} from "lucide-react";

type BridgeState = {
  connected: boolean;
  bridgeOnline: boolean;
  phone: string;
  pairingCode: string;
  pairingCodeAt: number;
  pairingCodeFresh: boolean;
  pairingRequestedAt: number;
  statusMessage: string;
  lastHeartbeatAt: number;
  serverNowMs?: number;
};

type AllowedGroup = {
  id: string;
  name: string;
  enabled: boolean;
  addedAt?: string;
};

type DetectedGroup = {
  id: string;
  name: string;
  lastSeenAt?: string;
  lastMessage?: string;
};

type WaCsConfig = {
  enabled: boolean;
  autoSchedule: boolean;
  openHourWib: number;
  openMinuteWib: number;
  closeHourWib: number;
  closeMinuteWib: number;
  ignorePrivateChats: boolean;
  storeScope: "ALL" | "SUKO" | "MUKU" | "ZES";
  csName: string;
  adminPhone?: string;
  storeName: string;
  humanTakeoverMinutes: number;
  replyWithImage: boolean;
  allowedGroups: AllowedGroup[];
  detectedGroups: DetectedGroup[];
  fonnteTokenConfigured?: boolean;
  fonnteTokenPreview?: string;
  serverWibTime?: string;
  withinStoreHours?: boolean;
  updatedAt?: string;
};

type WaCsLog = {
  id: string;
  timestamp: string;
  wibTime?: string;
  source: string;
  groupId?: string;
  groupName?: string;
  senderName?: string;
  message: string;
  decision: string;
  reason: string;
  replyPreview?: string;
  imageUrl?: string | null;
  matchedSku?: string | null;
  elapsedMs?: number;
};

type SimResult = {
  shouldReply: boolean;
  reason: string;
  intent?: string;
  replyText?: string;
  imageUrl?: string | null;
  replyMessages?: Array<{
    text: string;
    imageUrl?: string | null;
  }>;
  matchedProducts?: Array<{
    sku: string;
    article: string;
    name: string;
    brand: string;
    availability: "READY" | "SOLD_OUT";
    readyColors: string[];
    readySizes: string[];
    hargaNormalText: string;
    hargaPromoText?: string | null;
    promoLabel?: string;
    imageUrl?: string;
  }>;
  elapsedMs?: number;
};

const QUICK_SIM_PROMPTS = [
  "Mas kaos SUKO hitam size L ada ga?",
  "Kak ada promo jaket atau hoodie ga hari ini?",
  "Permisi kak celana pendek ready warna apa aja?",
  "Bro nanti malam nongkrong yuk wkwkwk",
];

function pad2(n: number) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, "0");
}

function decisionBadge(decision: string, reason: string) {
  if (decision === "REPLIED_WITH_IMAGE") {
    return { label: "Dibalas + Foto HD", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (decision === "REPLIED_TEXT") {
    return { label: "Dibalas Teks", cls: "bg-sky-100 text-sky-800 border-sky-200" };
  }
  if (decision === "COMMAND") {
    return { label: "Perintah PIC", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" };
  }
  if (reason === "CASUAL_CHAT_IGNORED") {
    return { label: "Diabaikan: Obrolan Santai", cls: "bg-slate-100 text-slate-700 border-slate-200" };
  }
  if (reason === "PRIVATE_CHAT_BLOCKED") {
    return { label: "Diblokir: Chat Pribadi", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  if (reason === "GROUP_NOT_WHITELISTED") {
    return { label: "Grup Baru Terdeteksi", cls: "bg-violet-100 text-violet-800 border-violet-200" };
  }
  if (reason === "MASTER_SWITCH_OFF") {
    return { label: "Diabaikan: Saklar OFF", cls: "bg-rose-100 text-rose-800 border-rose-200" };
  }
  if (reason === "OUTSIDE_STORE_HOURS") {
    return { label: "Diabaikan: Toko Tutup", cls: "bg-orange-100 text-orange-800 border-orange-200" };
  }
  return { label: reason || decision, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

export default function WaCsSuperAdminPage() {
  const [config, setConfig] = useState<WaCsConfig | null>(null);
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [logs, setLogs] = useState<WaCsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairPhoneInput, setPairPhoneInput] = useState("081296393972");
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Manual add group form
  const [newGroupId, setNewGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  // Fonnte token input
  const [fonnteTokenInput, setFonnteTokenInput] = useState("");
  const [setupTab, setSetupTab] = useState<"dummy" | "fonnte">("dummy");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live Simulator state
  const [simSender, setSimSender] = useState("Rina");
  const [simMessage, setSimMessage] = useState("Mas kaos SUKO hitam size L ada ga?");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/wa-cs", { cache: "no-store" });
      const data = await res.json();
      if (data?.success && data?.config) {
        setConfig(data.config);
        if (data.bridge) setBridge(data.bridge);
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        if (!silent && data.config.adminPhone) {
          const p = String(data.config.adminPhone);
          setPairPhoneInput(p.startsWith("62") ? "0" + p.slice(2) : p);
        }
      } else {
        showToast("err", data?.error || "Gagal memuat konfigurasi Auto CS");
      }
    } catch {
      showToast("err", "Koneksi ke server Auto CS bermasalah");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-polling status pairing setiap 2.5 detik saat sedang menunggu kode 8 digit / koneksi WA
  useEffect(() => {
    if (!pairingBusy && !(bridge?.pairingCodeFresh && !bridge?.connected)) return;
    const timer = setInterval(() => {
      fetchData(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [pairingBusy, bridge?.pairingCodeFresh, bridge?.connected, fetchData]);

  useEffect(() => {
    if (bridge?.pairingCodeFresh || bridge?.connected) {
      setPairingBusy(false);
    }
  }, [bridge?.pairingCodeFresh, bridge?.connected]);

  const handleRequestPairingCode = async () => {
    const cleanPhone = pairPhoneInput.trim();
    if (!cleanPhone) {
      showToast("err", "Masukkan nomor WA dulu (contoh: 081296393972)");
      return;
    }
    setPairingBusy(true);
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-pairing", phone: cleanPhone }),
      });
      const data = await res.json();
      if (data?.success) {
        if (data.config) setConfig(data.config);
        if (data.bridge) setBridge(data.bridge);
        showToast("ok", "Permintaan kode pairing dikirim! Tunggu 3-5 detik sampai 8 digit muncul di layar...");
      } else {
        setPairingBusy(false);
        showToast("err", data?.error || "Gagal meminta kode pairing");
      }
    } catch {
      setPairingBusy(false);
      showToast("err", "Gagal menghubungi server");
    }
  };

  const handleDisconnectWa = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-logout" }),
      });
      const data = await res.json();
      if (data?.success && data.bridge) {
        setBridge(data.bridge);
        showToast("ok", "Perintah putuskan tautan WA dikirim.");
      }
    } catch {
      showToast("err", "Gagal memutuskan tautan WA");
    } finally {
      setSaving(false);
    }
  };

  const handleMasterToggle = async () => {
    if (!config || toggling) return;
    setToggling(true);
    const nextEnabled = !config.enabled;
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled: nextEnabled }),
      });
      const data = await res.json();
      if (data?.success && data?.config) {
        setConfig(data.config);
        showToast(
          "ok",
          nextEnabled
            ? "Auto CS WhatsApp AKTIF! Siap balas grup yang di-whitelist."
            : "Auto CS WhatsApp NON-AKTIF! Akun WA aman untuk chat pribadi."
        );
      } else {
        showToast("err", data?.error || "Gagal mengubah saklar Auto CS");
      }
    } catch {
      showToast("err", "Gagal menghubungi server");
    } finally {
      setToggling(false);
    }
  };

  const handleSaveSettings = async (extraPatch?: Record<string, unknown>) => {
    if (!config || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: "save-config",
        config: {
          enabled: config.enabled,
          autoSchedule: config.autoSchedule,
          openHourWib: config.openHourWib,
          openMinuteWib: config.openMinuteWib,
          closeHourWib: config.closeHourWib,
          closeMinuteWib: config.closeMinuteWib,
          ignorePrivateChats: config.ignorePrivateChats,
          storeScope: config.storeScope,
          csName: config.csName,
          adminPhone: config.adminPhone || "6281296393972",
          storeName: config.storeName,
          humanTakeoverMinutes: config.humanTakeoverMinutes,
          replyWithImage: config.replyWithImage,
          allowedGroups: config.allowedGroups,
          ...(fonnteTokenInput.trim() ? { fonnteToken: fonnteTokenInput.trim() } : {}),
          ...(extraPatch || {}),
        },
      };
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.success && data?.config) {
        setConfig(data.config);
        setFonnteTokenInput("");
        showToast("ok", "Pengaturan Auto CS berhasil disimpan ke Turso Cloud!");
      } else {
        showToast("err", data?.error || "Gagal menyimpan pengaturan");
      }
    } catch {
      showToast("err", "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  };

  const handleUpsertGroup = async (groupId: string, groupName: string, enabled = true) => {
    const cleanId = groupId.trim();
    if (!cleanId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert-group",
          groupId: cleanId,
          groupName: groupName.trim() || cleanId,
          enabled,
        }),
      });
      const data = await res.json();
      if (data?.success && data?.config) {
        setConfig(data.config);
        setNewGroupId("");
        setNewGroupName("");
        showToast("ok", enabled ? `Grup "${groupName || cleanId}" diaktifkan di bot!` : `Grup "${groupName || cleanId}" dijeda.`);
      } else {
        showToast("err", data?.error || "Gagal memperbarui grup");
      }
    } catch {
      showToast("err", "Gagal memperbarui grup");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-group", groupId }),
      });
      const data = await res.json();
      if (data?.success && data?.config) {
        setConfig(data.config);
        showToast("ok", "Grup dihapus dari whitelist.");
      }
    } catch {
      showToast("err", "Gagal menghapus grup");
    } finally {
      setSaving(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-logs" }),
      });
      const data = await res.json();
      if (data?.success) {
        setLogs([]);
        showToast("ok", "Riwayat log berhasil dibersihkan.");
      }
    } catch {
      showToast("err", "Gagal membersihkan log");
    }
  };

  const handleSimulate = async (customMsg?: string) => {
    const text = (customMsg ?? simMessage).trim();
    if (!text || simLoading) return;
    if (customMsg) setSimMessage(customMsg);
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/admin/wa-cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          message: text,
          senderName: simSender.trim() || "Rina",
          groupName: "Grup Dummy (Simulasi Web)",
          isGroup: true,
          ignoreSwitch: true,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setSimResult(data as SimResult);
        fetchData(true);
      } else {
        showToast("err", data?.error || "Simulasi gagal dijalankan");
      }
    } catch {
      showToast("err", "Gagal menghubungi Python AI CS Engine");
    } finally {
      setSimLoading(false);
    }
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-sm font-semibold">Memuat Pusat Kontrol Auto CS WhatsApp...</p>
        </div>
      </div>
    );
  }

  const allowedIds = new Set(config.allowedGroups.map((g) => g.id));
  const pendingDetectedGroups = (config.detectedGroups || []).filter((g) => !allowedIds.has(g.id));
  const activeAllowedCount = config.allowedGroups.filter((g) => g.enabled).length;
  const effectiveLiveNow = config.enabled && (!config.autoSchedule || config.withinStoreHours);

  const bridgeCmd = `cd "c:\\Max Display\\price-checker\\wa-cs-bridge"\nnpm install\nnpm start`;
  const webhookUrl = "https://www.luqmanganteng.my.id/api/webhook/wa-cs";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-14">
      {/* Header Sticky */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/super-admin"
              className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 shrink-0 transition-colors"
              aria-label="Kembali ke Super Admin"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                  Auto CS WhatsApp (AI Halo BCA)
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    effectiveLiveNow
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-rose-100 text-rose-800 border-rose-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${effectiveLiveNow ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  {effectiveLiveNow ? "LIVE MEMBALAS" : config.enabled ? "STANDBY (TOKO TUTUP)" : "NON-AKTIF (AMAN)"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Balas grup member otomatis + foto produk HD • Tanpa angka stok • 100% blokir chat pribadi teman
              </p>
            </div>
          </div>

          <button
            onClick={() => fetchData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 shrink-0 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-4 left-4 sm:left-auto sm:w-96 z-50">
          <div
            className={`rounded-xl px-4 py-3 shadow-lg border text-sm font-semibold flex items-start gap-2.5 ${
              toast.type === "ok"
                ? "bg-emerald-600 text-white border-emerald-500"
                : "bg-rose-600 text-white border-rose-500"
            }`}
          >
            {toast.type === "ok" ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
        {/* CARD 1: SAKLAR MASTER ON/OFF (BESAR & INSTAN) */}
        <section
          className={`rounded-2xl p-5 border-2 transition-colors shadow-xs ${
            config.enabled
              ? "bg-emerald-50 border-emerald-300"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Power className={`w-6 h-6 ${config.enabled ? "text-emerald-600" : "text-rose-500"}`} />
                <h2 className="text-lg font-extrabold text-slate-900">
                  Saklar Master Auto CS WhatsApp
                </h2>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {config.enabled ? (
                  <>
                    Auto CS sedang <strong className="text-emerald-700">MENYALA</strong> untuk{" "}
                    <strong>{activeAllowedCount} grup aktif</strong>. Matikan saklar ini (atau ketik{" "}
                    <code className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">!csoff</code> di WA) kapan saja saat toko tutup.
                  </>
                ) : (
                  <>
                    Auto CS sedang <strong className="text-rose-600">DIMATIKAN</strong>. Akun WA Kakak 100% tidak akan membalas otomatis siapa pun (teman, keluarga, maupun grup).
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  Jam Server: {config.serverWibTime || "-"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                    config.withinStoreHours
                      ? "bg-emerald-100/80 text-emerald-800 border-emerald-200"
                      : "bg-amber-100/80 text-amber-800 border-amber-200"
                  }`}
                >
                  {config.withinStoreHours ? "Dalam Jam Operasional Toko" : "Di Luar Jam Toko (Auto-OFF)"}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  Chat Pribadi: {config.ignorePrivateChats ? "100% Diblokir" : "Diizinkan"}
                </span>
              </div>
            </div>

            <button
              onClick={handleMasterToggle}
              disabled={toggling}
              className={`w-full sm:w-auto min-w-[200px] px-6 py-4 rounded-2xl font-extrabold text-base shadow-sm flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-60 ${
                config.enabled
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {toggling ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Power className="w-5 h-5" />
              )}
              {config.enabled ? "MATIKAN AUTO CS" : "AKTIFKAN AUTO CS"}
            </button>
          </div>
        </section>

        {/* CARD 1B: KONEKSI & TOMBOL BUILD KODE PAIRING 8 DIGIT LANGSUNG DI WEB */}
        <section className="bg-white rounded-2xl border-2 border-indigo-200 shadow-xs overflow-hidden">
          <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h2 className="font-extrabold text-base">Tautkan Nomor WhatsApp (Kode Pairing 8 Digit)</h2>
                <p className="text-xs text-slate-300">
                  Klik tombol di bawah untuk mem-build kode 8 digit, lalu masukkan kodenya di WhatsApp HP Kakak
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${
                bridge?.connected
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                  : bridge?.bridgeOnline
                  ? "bg-amber-500/20 text-amber-200 border border-amber-400/40"
                  : "bg-rose-500/20 text-rose-200 border border-rose-400/40"
              }`}
            >
              {bridge?.connected ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              {bridge?.connected
                ? "WA TERSAMBUNG"
                : bridge?.bridgeOnline
                ? "BRIDGE ONLINE (SIAP PAIRING)"
                : "BRIDGE PC OFFLINE"}
            </span>
          </div>

          <div className="p-5 space-y-4">
            {bridge?.connected ? (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    WhatsApp +{bridge.phone || config.adminPhone || "6281296393972"} Aktif Tersambung!
                  </p>
                  <p className="text-xs text-emerald-800">
                    Sekarang kirim 1 chat tes di <strong>Grup Dummy</strong>, lalu klik <strong>Segarkan</strong> agar grupnya muncul di Whitelist di bawah.
                  </p>
                </div>
                <button
                  onClick={handleDisconnectWa}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Unlink className="w-4 h-4" />
                  Putuskan / Ganti WA
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Nomor WhatsApp Admin CS
                    </label>
                    <input
                      type="tel"
                      value={pairPhoneInput}
                      onChange={(e) => setPairPhoneInput(e.target.value)}
                      placeholder="081296393972"
                      className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-base font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleRequestPairingCode}
                    disabled={pairingBusy}
                    className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 shrink-0"
                  >
                    {pairingBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    {pairingBusy ? "Membuat Kode 8 Digit..." : "BUILD KODE PAIRING 8 DIGIT"}
                  </button>
                </div>

                {/* Kotak Hasil Kode Pairing 8 Digit Besar */}
                {bridge?.pairingCodeFresh && bridge.pairingCode ? (
                  <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-400 p-5 text-center space-y-3">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                      Masukkan Kode Ini di 8 Kotak WhatsApp HP Kakak Sekarang:
                    </p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      <span className="text-3xl sm:text-4xl font-mono font-black tracking-[0.2em] text-slate-900 bg-white px-6 py-3 rounded-2xl border-2 border-emerald-300 shadow-xs select-all">
                        {bridge.pairingCode}
                      </span>
                      <button
                        onClick={() => copyText("paircode", bridge.pairingCode.replace(/-/g, ""))}
                        className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        {copiedKey === "paircode" ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        {copiedKey === "paircode" ? "Disalin!" : "Salin Kode"}
                      </button>
                    </div>
                    <p className="text-xs text-emerald-800">
                      Di WA HP: <strong>Perangkat Tertaut → Tautkan Perangkat → Tautkan dengan nomor telepon saja</strong> → ketik 8 digit di atas. Halaman ini otomatis berubah hijau begitu tersambung!
                    </p>
                  </div>
                ) : pairingBusy ? (
                  <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 flex items-center gap-3 text-xs font-semibold text-indigo-900">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                    <div>
                      <p className="font-extrabold">Sedang meminta kode 8 digit resmi dari WhatsApp...</p>
                      <p className="text-indigo-700 mt-0.5">
                        {bridge?.bridgeOnline
                          ? "Bridge PC aktif! Tunggu 3–6 detik kode akan langsung muncul di kotak ini."
                          : "Pastikan wa-cs-bridge sudah jalan di PC (`cd wa-cs-bridge && npm start`), begitu aktif kode otomatis muncul di sini."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Status bridge: <strong>{bridge?.statusMessage || "Siap digunakan"}</strong>.{" "}
                    {!bridge?.bridgeOnline && (
                      <span className="text-rose-600 font-semibold">
                        (Jalankan `npm start` di folder `wa-cs-bridge` PC agar tombol Build Kode aktif!)
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* CARD 2: SIMULATOR CHAT LIVE (TEST SEBELUM PASANG WA!) */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-indigo-600 text-white px-5 py-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 shrink-0" />
              <div>
                <h2 className="font-extrabold text-base">Simulator Live Chat Grup (Test Tanpa WA)</h2>
                <p className="text-xs text-indigo-100">
                  Uji langsung balasan AI Halo BCA, pencarian Turso DB, foto HD produk, & filter obrolan santai
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Quick test chips */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contoh Chat Customer (Klik untuk Test):</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_SIM_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSimulate(q)}
                    disabled={simLoading}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 text-xs font-semibold text-slate-700 text-left transition-colors"
                  >
                    &ldquo;{q}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            {/* Form input simulasi */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Nama Member</label>
                <input
                  type="text"
                  value={simSender}
                  onChange={(e) => setSimSender(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Rina"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-600 mb-1">Pesan di Grup WA</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={simMessage}
                    onChange={(e) => setSimMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSimulate();
                    }}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Contoh: Mas kaos SUKO hitam size L ready ga?"
                  />
                  <button
                    onClick={() => handleSimulate()}
                    disabled={simLoading}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center gap-1.5 shrink-0 disabled:opacity-60"
                  >
                    {simLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Test
                  </button>
                </div>
              </div>
            </div>

            {/* Hasil Preview WhatsApp Bubble */}
            {simResult && (
              <div className="rounded-2xl bg-[#efeae2] border border-slate-300 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                  <span
                    className={`px-2.5 py-1 rounded-lg border ${
                      simResult.shouldReply
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                    }`}
                  >
                    {simResult.shouldReply ? `BOT MEMBALAS (${simResult.reason})` : `BOT DIAM / DIABAIKAN (${simResult.reason})`}
                  </span>
                  <span className="text-slate-600">
                    Intent: {simResult.intent || "-"} • {simResult.elapsedMs || 0} ms
                  </span>
                </div>

                {/* Bubble customer */}
                <div className="flex justify-start">
                  <div className="max-w-md bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-xs border border-slate-200">
                    <p className="text-[11px] font-bold text-indigo-600 mb-0.5">{simSender || "Customer"}</p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{simMessage}</p>
                  </div>
                </div>

                {/* Bubble balasan CS + multi foto per produk */}
                {simResult.shouldReply && simResult.replyText ? (
                  <div className="space-y-2.5">
                    {(simResult.replyMessages && simResult.replyMessages.length > 0
                      ? simResult.replyMessages
                      : [{ text: simResult.replyText, imageUrl: simResult.imageUrl }]
                    ).map((card, idx) => (
                      <div key={idx} className="flex justify-end">
                        <div className="max-w-md bg-[#d9fdd3] rounded-2xl rounded-tr-sm p-3 shadow-xs border border-emerald-200 space-y-2.5">
                          <p className="text-[11px] font-bold text-emerald-800">
                            {config.csName} (Auto CS){simResult.replyMessages && simResult.replyMessages.length > 1 ? ` • Foto ${idx + 1}/${simResult.replyMessages.length}` : ""}
                          </p>
                          {card.imageUrl && (
                            <div className="rounded-xl overflow-hidden bg-white border border-emerald-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={card.imageUrl}
                                alt={`Foto Produk ${idx + 1}`}
                                className="w-full max-h-72 object-contain bg-white"
                              />
                            </div>
                          )}
                          <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                            {card.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-white/90 border border-slate-300 px-3.5 py-2.5 text-xs text-slate-700 font-semibold">
                    Bot sengaja <strong>TIDAK membalas</strong> pesan ini karena terdeteksi bukan pertanyaan produk/promo (anti-spam di grup!).
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* CARD 3: WHITELIST GRUP WHATSAPP (GRUP DUMMY & MEMBER EKSKLUSIF) */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Whitelist Grup WhatsApp (Grup Dummy & Member Eksklusif)
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Bot <strong>HANYA</strong> boleh membalas di grup yang ada di daftar ini. Kirim 1 chat di Grup Dummy setelah WA tersambung — grup akan otomatis muncul di bawah agar tinggal <strong>1 klik Aktifkan</strong>!
              </p>
            </div>
          </div>

          {/* Grup baru terdeteksi otomatis */}
          {pendingDetectedGroups.length > 0 && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 space-y-2.5">
              <p className="text-xs font-extrabold text-violet-800 uppercase tracking-wider">
                Grup Baru Terdeteksi Otomatis ({pendingDetectedGroups.length}) — Klik untuk Izinkan:
              </p>
              <div className="space-y-2">
                {pendingDetectedGroups.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white rounded-xl p-3 border border-violet-200"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-900">{g.name || g.id}</p>
                      <p className="text-xs font-mono text-slate-500 break-all">{g.id}</p>
                      {g.lastMessage && (
                        <p className="text-xs text-slate-600">Chat terakhir: &ldquo;{g.lastMessage}&rdquo;</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleUpsertGroup(g.id, g.name, true)}
                      disabled={saving}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      Aktifkan Grup Ini
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daftar grup whitelisted */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Grup Diizinkan ({config.allowedGroups.length}):
            </p>
            {config.allowedGroups.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                Belum ada grup di whitelist. Hubungkan WA via panduan di bawah, kirim 1 pesan di <strong>Grup Dummy</strong>, lalu klik <strong>Segarkan</strong> untuk mengaktifkannya dengan 1 klik.
              </div>
            ) : (
              <div className="space-y-2">
                {config.allowedGroups.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl p-3.5 border border-slate-200 bg-slate-50"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{g.name || g.id}</p>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            g.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {g.enabled ? "AKTIF" : "DIJEDA"}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-500 break-all">{g.id}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleUpsertGroup(g.id, g.name, !g.enabled)}
                        disabled={saving}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                          g.enabled
                            ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        {g.enabled ? "Jeda" : "Aktifkan"}
                      </button>
                      <button
                        onClick={() => handleRemoveGroup(g.id)}
                        disabled={saving}
                        className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                        aria-label="Hapus grup"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tambah grup manual (opsional) */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-500 mb-2">Tambah ID Grup Manual (Opsional):</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nama Grup (misal: Grup Dummy Test)"
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900"
              />
              <input
                type="text"
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                placeholder="ID Grup (120363xxxx@g.us)"
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900 font-mono"
              />
              <button
                onClick={() => handleUpsertGroup(newGroupId, newGroupName, true)}
                disabled={saving || !newGroupId.trim()}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Tambah ke Whitelist
              </button>
            </div>
          </div>
        </section>

        {/* CARD 4: PENGATURAN KEAMANAN, JADWAL TOKO, & PERSONA HALO BCA */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              Proteksi Anti-Salah Balas & Persona CS
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Toggle Blokir Chat Pribadi */}
            <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-900">Blokir 100% Chat Pribadi / Teman</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  WAJIB NYALA agar chat teman/keluarga ke nomor pribadi tidak pernah dibalas bot.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.ignorePrivateChats}
                onChange={(e) => setConfig({ ...config, ignorePrivateChats: e.target.checked })}
                className="w-5 h-5 mt-0.5 accent-emerald-600 shrink-0"
              />
            </label>

            {/* Toggle Auto Schedule */}
            <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-900">Auto-OFF Saat Toko Tutup (WIB)</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Otomatis berhenti membalas di luar jam operasional meski lupa mematikan saklar.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.autoSchedule}
                onChange={(e) => setConfig({ ...config, autoSchedule: e.target.checked })}
                className="w-5 h-5 mt-0.5 accent-emerald-600 shrink-0"
              />
            </label>

            {/* Toggle Foto Produk */}
            <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  Kirim Foto Produk HD dari Database
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Otomatis melampirkan foto produk resmi yang cocok warna/artikelnya bersama balasan teks.
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.replyWithImage}
                onChange={(e) => setConfig({ ...config, replyWithImage: e.target.checked })}
                className="w-5 h-5 mt-0.5 accent-emerald-600 shrink-0"
              />
            </label>

            {/* Info Privacy Rule Hard-Coded */}
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70">
              <p className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-700" />
                Sensor Qty Stok: TERKUNCI PERMANEN
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Angka stok dihapus di level Python sebelum masuk AI. Customer hanya melihat status <strong>Ready</strong> atau <strong>Sold Out</strong>.
              </p>
            </div>
          </div>

          {/* Jam Operasional & Identitas CS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jam Buka Toko (WIB)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={config.openHourWib}
                  onChange={(e) => setConfig({ ...config, openHourWib: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-base text-center font-bold"
                />
                <span className="font-bold">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={config.openMinuteWib}
                  onChange={(e) => setConfig({ ...config, openMinuteWib: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-base text-center font-bold"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Aktif mulai {pad2(config.openHourWib)}:{pad2(config.openMinuteWib)} WIB
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jam Tutup Toko (WIB)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={config.closeHourWib}
                  onChange={(e) => setConfig({ ...config, closeHourWib: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-base text-center font-bold"
                />
                <span className="font-bold">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={config.closeMinuteWib}
                  onChange={(e) => setConfig({ ...config, closeMinuteWib: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-base text-center font-bold"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Auto-OFF pukul {pad2(config.closeHourWib)}:{pad2(config.closeMinuteWib)} WIB
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Cakupan Katalog Toko</label>
              <select
                value={config.storeScope}
                onChange={(e) =>
                  setConfig({ ...config, storeScope: e.target.value as WaCsConfig["storeScope"] })
                }
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-900"
              >
                <option value="ALL">Semua Toko (SUKO + Mu+Ku + ZES)</option>
                <option value="SUKO">Khusus SUKO</option>
                <option value="MUKU">Khusus Mu+Ku (Multibrand)</option>
                <option value="ZES">Khusus ZES</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Jeda Jika PIC Balas Manual</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={config.humanTakeoverMinutes}
                  onChange={(e) =>
                    setConfig({ ...config, humanTakeoverMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-base font-bold text-center"
                />
                <span className="text-xs font-bold text-slate-600 shrink-0">menit</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Bot minggir saat PIC ikut nimbrung</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nama CS di Sapaan</label>
              <input
                type="text"
                value={config.csName}
                onChange={(e) => setConfig({ ...config, csName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900"
                placeholder="Luqman"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nomor WA Admin CS (PIC)</label>
              <input
                type="tel"
                value={config.adminPhone || "6281296393972"}
                onChange={(e) => setConfig({ ...config, adminPhone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base font-mono text-slate-900"
                placeholder="081296393972"
              />
              <p className="text-[11px] text-slate-400 mt-1">Hanya nomor ini yang berhak pakai !csoff / !cson</p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Nama Toko / Grup Resmi</label>
              <input
                type="text"
                value={config.storeName}
                onChange={(e) => setConfig({ ...config, storeName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900"
                placeholder="SUKO & Mu+Ku Official"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => handleSaveSettings()}
              disabled={saving}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Simpan Pengaturan Auto CS
            </button>
          </div>
        </section>

        {/* CARD 5: PANDUAN KONEKSI WHATSAPP (GRUP DUMMY GRATIS vs FONNTE 24 JAM) */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 px-5 pt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSetupTab("dummy")}
              className={`px-4 py-2.5 text-sm font-extrabold border-b-2 flex items-center gap-2 transition-colors ${
                setupTab === "dummy"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Terminal className="w-4 h-4" />
              Mode 1: Test Grup Dummy Hari Ini (Gratis di PC)
            </button>
            <button
              onClick={() => setSetupTab("fonnte")}
              className={`px-4 py-2.5 text-sm font-extrabold border-b-2 flex items-center gap-2 transition-colors ${
                setupTab === "fonnte"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Cloud className="w-4 h-4" />
              Mode 2: Cloud 24 Jam (Fonnte Webhook)
            </button>
          </div>

          <div className="p-5">
            {setupTab === "dummy" ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 space-y-1">
                  <p className="font-extrabold">Langkah Cepat Test di Grup Dummy (2 Menit):</p>
                  <p>1. Jalankan perintah di bawah pada PowerShell PC, lalu scan QR menggunakan menu <strong>Perangkat Tertaut (Linked Devices)</strong> di WhatsApp HP Kakak.</p>
                  <p>2. Buat 1 <strong>Grup Dummy</strong> di WA bersama 1 nomor teman/cadangan, lalu kirim chat tes: <em>&ldquo;Mas kaos SUKO ada ga?&rdquo;</em>.</p>
                  <p>3. Klik <strong>Segarkan</strong> di halaman ini → Grup Dummy muncul otomatis di kotak ungu → klik <strong>Aktifkan Grup Ini</strong> → Nyalakan Saklar Master di atas!</p>
                </div>

                <div className="relative rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-xs overflow-x-auto">
                  <pre>{bridgeCmd}</pre>
                  <button
                    onClick={() => copyText("cmd", bridgeCmd)}
                    className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-sans font-bold flex items-center gap-1"
                  >
                    {copiedKey === "cmd" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === "cmd" ? "Disalin" : "Salin"}
                  </button>
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 space-y-1">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Perintah Darurat Langsung dari WA Kakak Sendiri:
                  </p>
                  <p>
                    • Ketik <strong>!csoff</strong> di chat WA manapun → Saklar Master langsung MATI seketika!
                  </p>
                  <p>
                    • Ketik <strong>!cson</strong> → Menyalakan kembali Saklar Master.
                  </p>
                  <p>
                    • Ketik <strong>!csstatus</strong> → Cek status ON/OFF, jam operasional WIB, & grup aktif.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Jika nanti ingin bot hidup <strong>24 jam non-stop tanpa menyalakan PC</strong>, cukup pasang URL Webhook ini di dashboard <strong>Fonnte.com</strong> dan masukkan Token perangkat Fonnte di bawah:
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">URL Webhook Fonnte</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono text-sm text-slate-800"
                    />
                    <button
                      onClick={() => copyText("webhook", webhookUrl)}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                    >
                      {copiedKey === "webhook" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      Salin
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Token Perangkat Fonnte {config.fonnteTokenConfigured ? `(Tersimpan: ${config.fonnteTokenPreview})` : "(Belum diisi)"}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      value={fonnteTokenInput}
                      onChange={(e) => setFonnteTokenInput(e.target.value)}
                      placeholder="Tempel Token Fonnte baru di sini..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base text-slate-900"
                    />
                    <button
                      onClick={() => handleSaveSettings()}
                      disabled={saving || !fonnteTokenInput.trim()}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 shrink-0"
                    >
                      Simpan Token
                    </button>
                    {config.fonnteTokenConfigured && (
                      <button
                        onClick={() => handleSaveSettings({ clearFonnteToken: true })}
                        disabled={saving}
                        className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold shrink-0"
                      >
                        Hapus Token
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CARD 6: LOG AKTIVITAS TERBARU */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-700" />
              <h2 className="text-base font-extrabold text-slate-900">
                Log Aktivitas Auto CS ({logs.length})
              </h2>
            </div>
            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-xs font-bold text-slate-600 transition-colors"
              >
                Bersihkan Log
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">
              Belum ada aktivitas chat tercatat. Coba klik tombol <strong>Test</strong> di Simulator Live Chat di atas!
            </p>
          ) : (
            <div className="space-y-2.5">
              {logs.map((log) => {
                const badge = decisionBadge(log.decision, log.reason);
                return (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {log.senderName || "Member"} • {log.groupName || log.source}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {log.wibTime || log.timestamp} {log.elapsedMs ? `• ${log.elapsedMs}ms` : ""}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800">
                      <strong className="text-slate-500">Pesan:</strong> {log.message}
                    </p>
                    {log.replyPreview && (
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">
                        <strong className="text-emerald-700">Respon:</strong> {log.replyPreview}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

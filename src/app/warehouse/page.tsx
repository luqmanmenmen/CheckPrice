"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  UserCircle2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  PackageOpen,
  Search,
  Image as ImageIcon,
  X,
  Maximize2,
  Trash2,
  Copy,
  Check,
  Tag,
  Layers,
  ArrowLeft,
  CheckCheck,
} from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";
import { AlertModal } from "@/components/AlertModal";
import ImageLightboxModal from "@/components/ImageLightboxModal";
import {
  optimizeRetailImageUrl,
  preloadProductImages,
} from "@/components/ProductImageSlider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Ticket = {
  id: string;
  sku: string;
  size: string | null;
  qty: number | null;
  type: "REQUEST" | "STOCK_CHECK" | "FACING_OUT";
  status: "PENDING" | "READY" | "OOS" | "COMPLETED";
  createdAt: string;
  requester: { name: string; nik: string };
  productName?: string;
  article?: string | null;
  brand?: string | null;
  dept?: string | null;
  barcode?: string | null;
  hargaNormal?: number;
  hargaPromo?: number | null;
  stok?: number | null;
  color?: string | null;
  productSize?: string | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
};

const INVALID_ARTICLE_VALUES = new Set(["", "0", "-", "PRODUK BARU", "N/A"]);

/**
 * Mengurai nama & atribut produk dari DB tanpa memotong teks secara sembarangan.
 * Format PQ lama ("NAMA BAJU : WARNA : SIZE") dipecah ke nama utama + varian cadangan,
 * sedangkan deskripsi murni StoreHub ("SS T-SHIRT THEME...") ditampilkan utuh 100%.
 */
function parseWarehouseProduct(ticket: Ticket) {
  const rawDesc = (ticket.productName || "").trim();
  const parts = rawDesc.includes(":")
    ? rawDesc.split(":").map((p) => p.trim()).filter(Boolean)
    : [];

  const mainName = parts.length > 0 ? parts[0] : rawDesc || `SKU ${ticket.sku}`;
  const fallbackColor = !ticket.color && parts.length > 1 ? parts[1] : null;
  const fallbackSize =
    !ticket.productSize && !ticket.size && parts.length > 2 ? parts[2] : null;

  const rawArticle = (ticket.article || "").trim();
  const article = !INVALID_ARTICLE_VALUES.has(rawArticle.toUpperCase())
    ? rawArticle
    : null;

  const color = (ticket.color || fallbackColor || "").trim() || null;
  const size = (ticket.size || ticket.productSize || fallbackSize || "").trim() || null;

  const brand = (ticket.brand || "").trim();
  const dept = (ticket.dept || "").trim();
  const brandDeptLabel =
    brand && dept && brand.toUpperCase() !== dept.toUpperCase()
      ? `${brand} • ${dept}`
      : brand || dept || "";

  return {
    mainName,
    article,
    color,
    size,
    brandDeptLabel,
    extraTags: parts.slice(1).filter((v) => {
      const up = v.toUpperCase();
      return up !== (color || "").toUpperCase() && up !== (size || "").toUpperCase();
    }),
  };
}

export default function WarehouseDashboard() {
  const [user, setUser] = useState<any>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "DONE">("ALL");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [alert, setAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
  });

  const showAlert = (
    title: string,
    message: string,
    type: "success" | "error" | "warning" = "warning"
  ) => {
    setAlert({ isOpen: true, title, message, type });
  };

  const previousTicketIds = useRef<Set<string>>(new Set());
  // Catat grup yang user tutup/buka manual agar grup PENDING baru selalu otomatis terbuka
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(new Set());
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());
  const [batchSelections, setBatchSelections] = useState<Record<string, "READY" | "OOS">>({});
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
    sku: string;
  } | null>(null);

  // Fetch tickets setiap 10 detik
  const { data, mutate } = useSWR("/api/tickets", fetcher, {
    refreshInterval: 10000,
  });
  const tickets: Ticket[] = data?.tickets || [];

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((d) => {
        if (d.user) setUser(d.user);
      });
  }, []);

  // Preload foto produk agar langsung tampil 0ms
  useEffect(() => {
    if (tickets.length > 0) {
      preloadProductImages(
        tickets.map((t) => t.imageUrl || t.photoUrl),
        400
      );
    }
  }, [tickets]);

  const stats = useMemo(() => {
    let pending = 0;
    let ready = 0;
    let oos = 0;
    let totalPcs = 0;
    for (const t of tickets) {
      totalPcs += t.qty || 1;
      if (t.status === "PENDING") pending++;
      else if (t.status === "READY") ready++;
      else if (t.status === "OOS") oos++;
    }
    return { pending, ready, oos, totalPcs };
  }, [tickets]);

  // Filter & kelompokkan tiket berdasarkan createdAt (detik) + requester NIK
  const ticketGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const groups = new Map<
      string,
      {
        id: string;
        createdAt: string;
        requester: { name: string; nik: string };
        tickets: Ticket[];
        hasPending: boolean;
      }
    >();

    tickets.forEach((ticket) => {
      if (statusFilter === "PENDING" && ticket.status !== "PENDING") return;
      if (statusFilter === "DONE" && ticket.status === "PENDING") return;

      if (q) {
        const parsed = parseWarehouseProduct(ticket);
        const haystack = [
          ticket.sku,
          ticket.barcode,
          ticket.article,
          parsed.article,
          parsed.mainName,
          ticket.productName,
          parsed.color,
          parsed.size,
          ticket.brand,
          ticket.dept,
          ticket.requester?.name,
          ticket.requester?.nik,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return;
      }

      const timeKey = new Date(ticket.createdAt).setMilliseconds(0);
      const key = `${timeKey}_${ticket.requester.nik}`;

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          createdAt: ticket.createdAt,
          requester: ticket.requester,
          tickets: [],
          hasPending: false,
        });
      }

      const group = groups.get(key)!;
      group.tickets.push(ticket);
      if (ticket.status === "PENDING") {
        group.hasPending = true;
      }
    });

    return Array.from(groups.values());
  }, [tickets, searchQuery, statusFilter]);

  const isGroupExpanded = (group: { id: string; hasPending: boolean }) => {
    if (searchQuery.trim().length > 0) return true;
    if (group.hasPending) return !manuallyCollapsed.has(group.id);
    return manuallyExpanded.has(group.id);
  };

  const toggleGroup = (group: { id: string; hasPending: boolean }) => {
    const currentlyExpanded = isGroupExpanded(group);
    if (group.hasPending) {
      setManuallyCollapsed((prev) => {
        const next = new Set(prev);
        if (currentlyExpanded) next.add(group.id);
        else next.delete(group.id);
        return next;
      });
    } else {
      setManuallyExpanded((prev) => {
        const next = new Set(prev);
        if (currentlyExpanded) next.delete(group.id);
        else next.add(group.id);
        return next;
      });
    }
  };

  const handleCopyText = (key: string, value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  // Notifikasi suara "Ting-Tong" untuk tiket masuk baru
  function playTingTong() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      playTone(659.25, now, 0.5);
      playTone(523.25, now + 0.4, 0.7);
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  }

  useEffect(() => {
    if (!tickets.length || !user || user.status === "BREAK") return;
    const currentTicketIds = new Set(tickets.map((t) => t.id));
    let hasNewTicket = false;
    for (const id of currentTicketIds) {
      if (!previousTicketIds.current.has(id)) {
        hasNewTicket = true;
        break;
      }
    }
    if (hasNewTicket && previousTicketIds.current.size > 0) {
      playTingTong();
    }
    previousTicketIds.current = currentTicketIds;
  }, [tickets, user]);

  const toggleStatus = async () => {
    if (!user || togglingStatus) return;
    setTogglingStatus(true);
    const newStatus = user.status === "ACTIVE" ? "BREAK" : "ACTIVE";
    try {
      const res = await fetch("/api/auth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const resData = await res.json();
      if (resData.success) {
        setUser({ ...user, status: resData.status });
      }
    } catch (error) {
      console.error("Failed to toggle status:", error);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleMarkGroupAllReady = (groupTickets: Ticket[], e: React.MouseEvent) => {
    e.stopPropagation();
    setBatchSelections((prev) => {
      const next = { ...prev };
      groupTickets.forEach((t) => {
        if (t.status === "PENDING") {
          next[t.id] = "READY";
        }
      });
      return next;
    });
  };

  const handleBatchSubmit = async (groupId: string, groupTickets: Ticket[]) => {
    const updates = groupTickets
      .filter((t) => t.status === "PENDING" && batchSelections[t.id])
      .map((t) => ({
        ticketId: t.id,
        status: batchSelections[t.id],
        reason: batchSelections[t.id] === "OOS" ? "Kosong (Batch)" : undefined,
      }));

    if (updates.length === 0) {
      showAlert(
        "Peringatan",
        "Pilih status (Ready / Kosong) untuk minimal satu barang sebelum memproses.",
        "warning"
      );
      return;
    }

    const updatedIds = new Set(updates.map((u) => u.ticketId));

    mutate((currentData: any) => {
      if (!currentData?.tickets) return currentData;
      return {
        ...currentData,
        tickets: currentData.tickets.map((t: any) => {
          if (updatedIds.has(t.id)) {
            return {
              ...t,
              status: batchSelections[t.id],
              reason: batchSelections[t.id] === "OOS" ? "Kosong (Batch)" : undefined,
            };
          }
          return t;
        }),
      };
    }, false);

    setBatchSelections((prev) => {
      const next = { ...prev };
      updates.forEach((u) => delete next[u.ticketId]);
      return next;
    });

    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      mutate();
    } catch (error) {
      console.error("Failed to batch update tickets:", error);
      mutate();
    }
  };

  const [clearing, setClearing] = useState(false);
  const handleClearAllTickets = async () => {
    if (
      !confirm(
        "Bersihkan semua permintaan aktif di layar sekarang? Semua tiket lama akan ditutup agar tidak rancu."
      )
    )
      return;
    setClearing(true);
    mutate({ success: true, tickets: [] }, false);
    try {
      const res = await fetch("/api/tickets", { method: "DELETE" });
      const resData = await res.json();
      if (res.ok) {
        showAlert(
          "Sukses",
          resData.message || "Semua tiket berhasil dibersihkan.",
          "success"
        );
      }
      mutate();
    } catch (err) {
      console.error(err);
      mutate();
    } finally {
      setClearing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center text-sm font-semibold text-slate-500">
        Memuat ruang kerja Gudang Stock...
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={() => mutate()}>
      <div className="flex flex-col w-full pb-8 max-w-6xl mx-auto">
        {/* Header Hero Compact & Ringkas */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 lg:rounded-2xl p-4 sm:p-5 shadow-lg rounded-b-3xl text-white mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20 shrink-0">
                <UserCircle2 className="w-6 h-6 text-blue-100" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black tracking-widest uppercase bg-amber-400/20 text-amber-200 border border-amber-300/30 px-2 py-0.5 rounded-md">
                    {user.jobTitle || "Gudang Stock"}
                  </span>
                  {user.name?.toLowerCase().includes("developer") && (
                    <span className="text-[10px] font-black bg-white/20 text-white border border-white/30 px-2 py-0.5 rounded-md tracking-wider uppercase">
                      Developer
                    </span>
                  )}
                </div>
                <h1 className="font-black text-lg sm:text-xl leading-tight mt-1">
                  {user.name.replace(/\s*\(Developer\)/i, "").trim()}{" "}
                  <span className="text-blue-200 font-semibold text-sm">
                    ({user.nik})
                  </span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {user.role === "SUPERVISOR" && (
                <Link
                  href="/spv-gateway"
                  className="inline-flex items-center gap-1 text-xs font-bold bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-1.5 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  SPV
                </Link>
              )}

              {/* Toggle Status Shift */}
              <div
                className={`relative flex p-0.5 rounded-full shadow-inner w-28 h-8 cursor-pointer border transition-colors ${
                  togglingStatus ? "opacity-50 pointer-events-none" : ""
                } ${
                  user.status === "ACTIVE"
                    ? "bg-slate-950/40 border-emerald-400/40"
                    : "bg-slate-950/50 border-amber-400/50"
                }`}
                onClick={toggleStatus}
                title="Klik untuk pindah status Aktif / Rehat"
              >
                <div
                  className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full shadow-sm transition-all duration-300 ease-in-out ${
                    user.status === "ACTIVE"
                      ? "bg-emerald-500 left-0.5"
                      : "bg-amber-500 left-[50%]"
                  }`}
                />
                <div
                  className={`relative flex-1 flex items-center justify-center text-[10px] font-black z-10 ${
                    user.status === "ACTIVE" ? "text-white" : "text-slate-300"
                  }`}
                >
                  AKTIF
                </div>
                <div
                  className={`relative flex-1 flex items-center justify-center text-[10px] font-black z-10 ${
                    user.status === "BREAK" ? "text-white" : "text-slate-300"
                  }`}
                >
                  REHAT
                </div>
              </div>
            </div>
          </div>

          {/* 3 Ringkasan Statistik Gudang */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-100">Menunggu</span>
              <span
                className={`text-sm sm:text-base font-black px-2 py-0.5 rounded-lg ${
                  stats.pending > 0
                    ? "bg-amber-400 text-slate-900"
                    : "text-white"
                }`}
              >
                {stats.pending}
              </span>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-200">Ready</span>
              <span className="text-sm sm:text-base font-black text-emerald-300">
                {stats.ready}
              </span>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-200">Kosong</span>
              <span className="text-sm sm:text-base font-black text-rose-300">
                {stats.oos}
              </span>
            </div>
          </div>
        </div>

        {/* Search & Quick Filter Bar */}
        <div className="px-3.5 lg:px-0 flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Artikel, Nama Barang, Warna, Size, SKU, Brand..."
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  aria-label="Hapus pencarian"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {tickets.length > 0 && (
              <button
                onClick={handleClearAllTickets}
                disabled={clearing}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-xl shadow-xs transition-colors disabled:opacity-50 shrink-0"
                title="Bersihkan semua permintaan aktif di layar agar tidak rancu"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearing ? "Membersihkan..." : "Bersihkan Semua"}
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              {(
                [
                  { id: "ALL", label: `Semua (${tickets.length})` },
                  { id: "PENDING", label: `Menunggu (${stats.pending})` },
                  { id: "DONE", label: `Selesai (${stats.ready + stats.oos})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === tab.id
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span className="text-xs font-semibold text-slate-400">
              {stats.totalPcs} Total Pcs Hari Ini
            </span>
          </div>
        </div>

        {/* Ticket Groups */}
        <div className="px-3.5 lg:px-0 flex flex-col gap-4">
          {ticketGroups.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-25" />
              <p className="font-bold text-slate-600">
                {searchQuery
                  ? `Tidak ada pesanan yang cocok dengan "${searchQuery}"`
                  : "Tidak ada tiket gudang aktif saat ini."}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-3 text-xs font-bold text-blue-600 hover:underline"
                >
                  Reset Pencarian
                </button>
              )}
            </div>
          ) : (
            ticketGroups.map((group) => {
              const expanded = isGroupExpanded(group);
              const pendingItems = group.tickets.filter((t) => t.status === "PENDING");
              const pendingCount = pendingItems.length;
              const groupPcs = group.tickets.reduce((acc, t) => acc + (t.qty || 1), 0);
              const selectedInGroup = pendingItems.filter(
                (t) => Boolean(batchSelections[t.id])
              ).length;

              return (
                <div
                  key={group.id}
                  className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${
                    group.hasPending
                      ? "border-blue-200 ring-1 ring-blue-100"
                      : "border-emerald-200 opacity-80"
                  }`}
                >
                  {/* Group Header */}
                  <div
                    className={`px-4 py-3.5 flex flex-wrap justify-between items-center gap-3 cursor-pointer transition-colors ${
                      group.hasPending
                        ? "bg-gradient-to-r from-blue-50/80 to-white hover:from-blue-50"
                        : "bg-emerald-50/40 hover:bg-emerald-50/70"
                    }`}
                    onClick={() => toggleGroup(group)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            group.hasPending ? "bg-blue-600 animate-pulse" : "bg-emerald-500"
                          }`}
                        />
                        <h3 className="font-black text-base sm:text-lg text-slate-900">
                          {group.requester.name}
                        </h3>
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {group.requester.nik}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs font-bold">
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
                          <PackageOpen className="w-3.5 h-3.5" />
                          {group.tickets.length} Item ({groupPcs} Pcs)
                        </span>
                        {pendingCount > 0 ? (
                          <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                            {pendingCount} Menunggu
                          </span>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                            Semua Diproses
                          </span>
                        )}
                        <span className="text-slate-400 font-semibold inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(group.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {group.hasPending && pendingCount > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkGroupAllReady(group.tickets, e)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          title="Tandai seluruh item menunggu dalam pesanan ini sebagai Ready"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          Ready Semua
                        </button>
                      )}
                      <div className="bg-white border border-slate-200 p-1.5 rounded-lg text-slate-500">
                        {expanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Item Picking Cards */}
                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4 flex flex-col gap-3">
                      {group.tickets.map((ticket) => {
                        const rawImg = ticket.imageUrl || ticket.photoUrl;
                        const thumbUrl = optimizeRetailImageUrl(rawImg, 400);
                        const fullUrl = rawImg || "";
                        const parsed = parseWarehouseProduct(ticket);
                        const isReadySel = batchSelections[ticket.id] === "READY";
                        const isOosSel = batchSelections[ticket.id] === "OOS";

                        return (
                          <div
                            key={ticket.id}
                            className={`bg-white p-3.5 sm:p-4 rounded-2xl border shadow-xs transition-all ${
                              isReadySel
                                ? "border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/20"
                                : isOosSel
                                ? "border-rose-400 ring-2 ring-rose-100 bg-rose-50/20"
                                : "border-slate-200"
                            }`}
                          >
                            {/* Top Row: Thumbnail + Artikel & Nama UTUH (Zero Truncate!) */}
                            <div className="flex items-start gap-3.5">
                              {/* Foto Produk Cepat 0ms + Zoom */}
                              <div
                                onClick={(e) => {
                                  if (fullUrl) {
                                    e.stopPropagation();
                                    setPreviewImage({
                                      url: fullUrl,
                                      title: parsed.article
                                        ? `[${parsed.article}] ${parsed.mainName}`
                                        : parsed.mainName,
                                      sku: ticket.sku,
                                    });
                                  }
                                }}
                                className={`w-20 h-24 sm:w-24 sm:h-28 rounded-xl overflow-hidden shrink-0 border border-slate-200 relative group select-none ${
                                  thumbUrl
                                    ? "cursor-pointer bg-white hover:ring-2 hover:ring-blue-500 transition-all"
                                    : "bg-slate-100 flex items-center justify-center"
                                }`}
                                title={
                                  thumbUrl
                                    ? "Ketuk untuk memperbesar foto"
                                    : "Belum ada foto produk"
                                }
                              >
                                {thumbUrl ? (
                                  <>
                                    <img
                                      src={thumbUrl}
                                      alt={parsed.mainName}
                                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                      decoding="sync"
                                      loading="eager"
                                    />
                                    <span className="absolute bottom-1 right-1 bg-black/65 text-[9px] text-white px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                      <Maximize2 className="w-2.5 h-2.5" /> Zoom
                                    </span>
                                  </>
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-slate-400 p-1 text-center w-full h-full">
                                    <ImageIcon className="w-6 h-6 stroke-1 text-slate-300" />
                                    <span className="text-[9px] font-semibold text-slate-400 mt-1">
                                      No Foto
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Info Utama: Badges -> KODE ARTIKEL BESAR -> NAMA LENGKAP UTUH */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                  <span
                                    className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                      ticket.type === "REQUEST"
                                        ? "bg-indigo-100 text-indigo-700"
                                        : ticket.type === "FACING_OUT"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-sky-100 text-sky-800"
                                    }`}
                                  >
                                    {ticket.type === "REQUEST"
                                      ? "Request Barang"
                                      : ticket.type === "FACING_OUT"
                                      ? "Facing Out"
                                      : "Cek Stok"}
                                  </span>

                                  {parsed.brandDeptLabel && (
                                    <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md uppercase">
                                      {parsed.brandDeptLabel}
                                    </span>
                                  )}

                                  {typeof ticket.stok === "number" && (
                                    <span
                                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                                        ticket.stok > 0
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          : "bg-slate-50 text-slate-500 border-slate-200"
                                      }`}
                                    >
                                      Stok Sistem: {ticket.stok}
                                    </span>
                                  )}
                                </div>

                                {/* KODE ARTIKEL BESAR & JELAS — Tidak Pernah Kepotong! */}
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                  {parsed.article ? (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleCopyText(`art-${ticket.id}`, parsed.article!, e)
                                      }
                                      className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg shadow-xs transition-colors text-left"
                                      title="Ketuk untuk salin kode artikel"
                                    >
                                      <Tag className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                      <span className="font-mono font-black text-sm sm:text-base tracking-wide break-all whitespace-normal">
                                        {parsed.article}
                                      </span>
                                      {copiedKey === `art-${ticket.id}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                                      )}
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-slate-200 text-slate-700 font-mono font-black text-sm px-2.5 py-1 rounded-lg">
                                      SKU {ticket.sku}
                                    </span>
                                  )}
                                </div>

                                {/* NAMA BARANG LENGKAP (TANPA TRUNCATE!) */}
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug whitespace-normal break-words">
                                  {parsed.mainName}
                                </h4>

                                {parsed.extraTags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {parsed.extraTags.map((v, i) => (
                                      <span
                                        key={i}
                                        className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 whitespace-normal break-words"
                                      >
                                        {v}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Grid 3 Kolom Atribut Picking Gudang: WARNA • UKURAN • QTY MINTA */}
                            <div className="grid grid-cols-3 gap-2 mt-3">
                              <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl px-2.5 py-2">
                                <span className="block text-[10px] font-bold uppercase text-rose-500 tracking-wide">
                                  Warna
                                </span>
                                <span className="block text-xs sm:text-sm font-black text-rose-900 whitespace-normal break-words leading-tight mt-0.5">
                                  {parsed.color || "-"}
                                </span>
                              </div>

                              <div className="bg-violet-50/80 border border-violet-200 rounded-xl px-2.5 py-2">
                                <span className="block text-[10px] font-bold uppercase text-violet-500 tracking-wide">
                                  Ukuran
                                </span>
                                <span className="block text-sm sm:text-base font-black text-violet-900 whitespace-normal break-words leading-tight mt-0.5">
                                  {parsed.size || "-"}
                                </span>
                              </div>

                              <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-2.5 py-2">
                                <span className="block text-[10px] font-bold uppercase text-blue-600 tracking-wide">
                                  Qty Ambil
                                </span>
                                <span className="block text-sm sm:text-base font-black text-blue-900 leading-tight mt-0.5">
                                  {ticket.qty || 1} Pcs
                                </span>
                              </div>
                            </div>

                            {/* Baris Referensi Kode & Harga + Tombol Aksi Ready / Kosong */}
                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
                                <button
                                  type="button"
                                  onClick={(e) =>
                                    handleCopyText(`sku-${ticket.id}`, ticket.sku, e)
                                  }
                                  className="inline-flex items-center gap-1 font-mono font-bold text-slate-700 hover:text-blue-600"
                                  title="Ketuk untuk salin SKU"
                                >
                                  SKU: {ticket.sku}
                                  {copiedKey === `sku-${ticket.id}` && (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  )}
                                </button>

                                {ticket.barcode && (
                                  <span className="font-mono text-slate-500">
                                    BC: {ticket.barcode}
                                  </span>
                                )}

                                {ticket.hargaNormal && ticket.hargaNormal > 0 ? (
                                  ticket.hargaPromo && ticket.hargaPromo > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 font-bold">
                                      <span className="line-through text-slate-400">
                                        Rp {ticket.hargaNormal.toLocaleString("id-ID")}
                                      </span>
                                      <span className="text-emerald-700">
                                        Rp {ticket.hargaPromo.toLocaleString("id-ID")}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="font-bold text-blue-700">
                                      Rp {ticket.hargaNormal.toLocaleString("id-ID")}
                                    </span>
                                  )
                                ) : null}
                              </div>

                              {ticket.status === "PENDING" ? (
                                <div className="flex gap-2 w-full md:w-auto bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                                  <label
                                    className={`flex-1 md:flex-none cursor-pointer px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all font-bold text-xs sm:text-sm min-h-[40px] ${
                                      isReadySel
                                        ? "bg-emerald-500 text-white shadow-sm"
                                        : "text-slate-600 hover:bg-white"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`status-${ticket.id}`}
                                      className="hidden"
                                      checked={isReadySel}
                                      onChange={() =>
                                        setBatchSelections((prev) => ({
                                          ...prev,
                                          [ticket.id]: "READY",
                                        }))
                                      }
                                    />
                                    <CheckCircle2 className="w-4 h-4" />
                                    Ready
                                  </label>
                                  <label
                                    className={`flex-1 md:flex-none cursor-pointer px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all font-bold text-xs sm:text-sm min-h-[40px] ${
                                      isOosSel
                                        ? "bg-rose-500 text-white shadow-sm"
                                        : "text-slate-600 hover:bg-white"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`status-${ticket.id}`}
                                      className="hidden"
                                      checked={isOosSel}
                                      onChange={() =>
                                        setBatchSelections((prev) => ({
                                          ...prev,
                                          [ticket.id]: "OOS",
                                        }))
                                      }
                                    />
                                    <XCircle className="w-4 h-4" />
                                    Kosong
                                  </label>
                                </div>
                              ) : (
                                <div className="text-right shrink-0">
                                  <span
                                    className={`text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-wider border inline-flex items-center gap-1.5 ${
                                      ticket.status === "READY"
                                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                        : ticket.status === "OOS"
                                        ? "text-rose-700 bg-rose-50 border-rose-200"
                                        : "text-slate-600 bg-slate-100 border-slate-200"
                                    }`}
                                  >
                                    {ticket.status === "READY" ? (
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5" />
                                    )}
                                    {ticket.status === "READY"
                                      ? "Selesai (Ada)"
                                      : ticket.status === "OOS"
                                      ? "Kosong"
                                      : "Selesai"}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {group.hasPending && (
                        <div className="pt-1 flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBatchSubmit(group.id, group.tickets);
                            }}
                            disabled={selectedInGroup === 0}
                            className={`flex-1 font-black py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] ${
                              selectedInGroup > 0
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none"
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                            {selectedInGroup > 0
                              ? `Selesaikan Pesanan (${selectedInGroup}/${pendingCount} Terpilih)`
                              : "Pilih Ready / Kosong di Atas"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Lightbox Preview Modal with pinch-to-zoom & pan */}
      <ImageLightboxModal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        imageUrl={previewImage?.url || ""}
        title={previewImage?.title || ""}
        sku={previewImage?.sku}
      />

      <AlertModal
        isOpen={alert.isOpen}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onClose={() => setAlert((prev) => ({ ...prev, isOpen: false }))}
      />
    </PullToRefresh>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Barcode,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  UploadCloud,
  X,
} from "lucide-react";

const TextScanner = dynamic(() => import("@/components/TextScanner"), { ssr: false });

interface UpcomingVariant {
  sku: string;
  barcode?: string | null;
  article: string;
  description: string;
  brand: string;
  dept: string;
  color: string;
  size: string;
  stok: number;
  imageUrl?: string | null;
  hargaNormal: number;
  currentPromo?: number | null;
  currentDiskon?: string | null;
  nextHargaPromo?: number | null;
  nextDiskon?: string | null;
  nextDiscountType?: string | null;
  nextAcara?: string | null;
  statusChange: "NEW_PROMO" | "PRICE_CHANGE" | "CONTINUED";
}

interface UpcomingArticle {
  article: string;
  description: string;
  brand: string;
  dept: string;
  imageUrl?: string | null;
  totalStok: number;
  variantCount: number;
  hargaNormal: number;
  currentPromo?: number | null;
  currentDiskon?: string | null;
  nextHargaPromo?: number | null;
  nextDiskon?: string | null;
  nextDiscountType?: string | null;
  nextAcara?: string | null;
  nextFromDate?: string | null;
  nextToDate?: string | null;
  sourceFile?: string | null;
  statusChange: "NEW_PROMO" | "PRICE_CHANGE" | "CONTINUED";
  variants: UpcomingVariant[];
}

interface UpcomingResponse {
  available: boolean;
  folderName?: string;
  fromDate?: string | null;
  toDate?: string | null;
  generatedAt?: string;
  sourceFiles?: string[];
  totalSkus?: number;
  totalArticles?: number;
  summary?: {
    newPromo: number;
    priceChange: number;
    continued: number;
    withStock: number;
  };
  articles?: UpcomingArticle[];
}

function formatRupiah(angka?: number | null) {
  if (!angka || angka <= 0) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(angka);
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  NEW_PROMO: {
    label: "PROMO BARU",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  PRICE_CHANGE: {
    label: "HARGA BERUBAH",
    cls: "bg-amber-100 text-amber-800 border-amber-300",
  },
  CONTINUED: {
    label: "LANJUT",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export default function PromoMendatangPage() {
  const [data, setData] = useState<UpcomingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTION" | "NEW_PROMO" | "PRICE_CHANGE" | "CONTINUED">("ACTION");
  const [onlyStock, setOnlyStock] = useState(true);
  const [expandedArt, setExpandedArt] = useState<Record<string, boolean>>({});
  const [isScanning, setIsScanning] = useState(false);

  // Panel Upload & Trigger Draf (khusus SPV / Dev)
  const [canManage, setCanManage] = useState(false);
  const [startDateInput, setStartDateInput] = useState("");
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/promo-upcoming?t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch {
      setData({ available: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDraft();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((u) => {
        const user = u?.user;
        if (user && (user.role === "SUPERVISOR" || user.nik === "22054178")) {
          setCanManage(true);
        }
      })
      .catch(() => {});
  }, [loadDraft]);

  const handleScanSuccess = (code: string) => {
    const clean = String(code || "").trim();
    if (!clean) return;
    setIsScanning(false);
    setStatusFilter("ALL");
    setOnlyStock(false);
    setSearch(clean);
  };

  const handleUploadOrCompileDraft = async () => {
    setIsSubmitting(true);
    setActionNotice(null);
    try {
      let res: Response;
      if (draftFiles.length > 0) {
        const fd = new FormData();
        if (startDateInput) fd.append("startDate", startDateInput);
        for (const f of draftFiles) fd.append("file", f);
        res = await fetch("/api/promo-upcoming", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/promo-upcoming", { method: "POST" });
      }
      const json = await res.json();
      setActionNotice({ ok: res.ok && json.success !== false, msg: json.message || json.error || "Selesai." });
      if (res.ok) setDraftFiles([]);
    } catch (e: any) {
      setActionNotice({ ok: false, msg: e?.message || "Gagal menghubungi server" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredArticles = useMemo(() => {
    const list = data?.articles || [];
    const q = search.trim().toUpperCase();
    return list.filter((art) => {
      if (onlyStock && art.totalStok <= 0) return false;
      if (brandFilter !== "ALL") {
        const b = (art.brand || "").toUpperCase();
        if (brandFilter === "SUKO" && !b.includes("SUKO")) return false;
        if (brandFilter === "ZES" && b !== "ZES") return false;
        if (brandFilter === "MUKU" && (b.includes("SUKO") || b === "ZES")) return false;
      }
      if (statusFilter === "ACTION" && art.statusChange === "CONTINUED") return false;
      if (
        statusFilter !== "ALL" &&
        statusFilter !== "ACTION" &&
        art.statusChange !== statusFilter
      ) {
        return false;
      }
      if (q) {
        const hitHeader =
          art.article.toUpperCase().includes(q) ||
          art.description.toUpperCase().includes(q) ||
          (art.brand || "").toUpperCase().includes(q) ||
          (art.nextAcara || "").toUpperCase().includes(q);
        const hitVariant = art.variants.some(
          (v) =>
            v.sku.toUpperCase().includes(q) ||
            (v.barcode || "").toUpperCase().includes(q)
        );
        if (!hitHeader && !hitVariant) return false;
      }
      return true;
    });
  }, [data, search, brandFilter, statusFilter, onlyStock]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header Utama */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white px-4 py-4 shadow-lg print:hidden">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition"
              title="Kembali ke Beranda"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-amber-200" />
                <h1 className="text-lg sm:text-xl font-black tracking-tight">
                  Cek Promo Mendatang &amp; Persiapan POP (H-2 / H-1)
                </h1>
              </div>
              <p className="text-xs text-amber-100 mt-0.5">
                Simulasi baca harga promo baru sebelum hari launching — 100% terisolasi &amp; aman tidak merusak promo berjalan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadDraft()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Muat Ulang</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-orange-700 hover:bg-orange-50 text-xs font-extrabold shadow-sm transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Daftar POP</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4 space-y-4">
        {/* Banner Proteksi */}
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950">
              <span className="font-black uppercase tracking-wide">Mode Pratinjau POP (Belum Aktif di Kasir): </span>
              Harga promo di halaman ini hanya untuk cek &amp; pasang POP pajangan H-2 / H-1 sebelum hari-H launching.
            </div>
          </div>
          {data?.available && (
            <div className="text-[11px] font-mono font-bold bg-white/80 border border-amber-200 text-amber-900 px-3 py-1 rounded-xl shrink-0">
              {data.folderName} • {data.fromDate || "?"} s/d {data.toDate || "?"}
            </div>
          )}
        </div>

        {/* Panel Khusus SPV / Dev untuk Upload Draft Excel H-2 / H-1 */}
        {canManage && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4 text-orange-600" />
                  <span>Panel SPV: Muat / Upload Draf File Promo H-2 / H-1 (Ke Python Engine)</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Pilih file Excel promo minggu depan (atau kosongkan untuk memakai folder promo terbaru di Cloud Storage).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50"
                  title="Tanggal mulai berlaku promo"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  multiple
                  onChange={(e) => setDraftFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 cursor-pointer"
                >
                  {draftFiles.length > 0 ? `${draftFiles.length} File Dipilih` : "Pilih Excel H-2..."}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleUploadOrCompileDraft}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-extrabold cursor-pointer shadow-xs"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{draftFiles.length > 0 ? "Upload & Proses Draf" : "Proses Ulang Folder Terbaru"}</span>
                </button>
              </div>
            </div>
            {actionNotice && (
              <div
                className={`text-xs px-3 py-2 rounded-xl border font-semibold ${
                  actionNotice.ok
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {actionNotice.msg}
              </div>
            )}
          </div>
        )}

        {/* Bilah Cari, Scan Barcode, & Filter POP */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-3 print:hidden">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-orange-500">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scan barcode atau ketik Kode Artikel / SKU / Nama..."
                className="w-full bg-transparent text-xs sm:text-sm font-medium focus:outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsScanning(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
            >
              <Barcode className="w-4 h-4" />
              <span>Scan Tag</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["ALL", "SUKO", "MUKU", "ZES"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrandFilter(b)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    brandFilter === b
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {b === "ALL" ? "Semua Toko" : b === "MUKU" ? "Mu+Ku" : b}
                </button>
              ))}
              <span className="mx-1 text-slate-300">|</span>
              {(
                [
                  { id: "ACTION", label: "Perlu Ganti POP" },
                  { id: "NEW_PROMO", label: `Promo Baru (${data?.summary?.newPromo ?? 0})` },
                  { id: "PRICE_CHANGE", label: `Harga Berubah (${data?.summary?.priceChange ?? 0})` },
                  { id: "ALL", label: "Semua" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                    statusFilter === st.id
                      ? "bg-orange-600 text-white border-orange-600"
                      : "bg-orange-50/70 text-orange-800 border-orange-200 hover:bg-orange-100"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOnlyStock(!onlyStock)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border cursor-pointer transition ${
                onlyStock
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Hanya Stok Toko &gt; 0</span>
            </button>
          </div>
        </div>

        {/* Konten Hasil */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Loader2 className="w-8 h-8 text-orange-600 animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-500">Memuat draf promo H-2 / H-1...</p>
          </div>
        ) : !data?.available ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <Tag className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-extrabold text-slate-800">Belum Ada Draf Promo H-2 / H-1</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Saat email promo minggu berikutnya masuk atau diunggah oleh Supervisor di atas, seluruh artikel &amp; harga POP baru otomatis muncul di sini tanpa mengubah harga kasir hari ini.
            </p>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <Search className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Tidak ada artikel cocok pada filter ini.</p>
            <p className="text-xs text-slate-500">Coba ubah filter status menjadi &quot;Semua&quot; atau matikan filter &quot;Hanya Stok &gt; 0&quot;.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-bold">
                Menampilkan <strong className="text-slate-900">{filteredArticles.length}</strong> Artikel siap cek POP
              </span>
              {data.generatedAt && (
                <span>
                  Draf disusun:{" "}
                  {new Date(data.generatedAt).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredArticles.slice(0, 150).map((art) => {
                const badge = STATUS_BADGE[art.statusChange] || STATUS_BADGE.CONTINUED;
                const isOpen = Boolean(expandedArt[art.article]);
                return (
                  <div
                    key={art.article}
                    className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex flex-col gap-2.5 break-inside-avoid"
                  >
                    <div
                      onClick={() =>
                        setExpandedArt((prev) => ({ ...prev, [art.article]: !prev[art.article] }))
                      }
                      className="flex gap-3 cursor-pointer"
                    >
                      {art.imageUrl ? (
                        <img
                          src={art.imageUrl}
                          alt={art.description}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-16 h-20 rounded-xl object-cover object-top bg-slate-100 border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                          NO IMG
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="font-mono text-[11px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-md">
                            {art.article}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Stok {art.totalStok} pcs ({art.variantCount} var)
                          </span>
                        </div>

                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug whitespace-normal break-words">
                          {art.description}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {art.brand} • {art.dept}
                        </p>

                        {/* Perbandingan Harga Berjalan vs Harga POP Mendatang */}
                        <div className="mt-2 grid grid-cols-2 gap-2 bg-slate-50 rounded-xl p-2 border border-slate-100">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Sekarang (Berjalan)</div>
                            <div className="text-xs font-extrabold text-slate-700">
                              {art.currentPromo
                                ? formatRupiah(art.currentPromo)
                                : art.currentDiskon || `${formatRupiah(art.hargaNormal)} (Normal)`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-orange-600 uppercase">POP Baru (H-2 Draft)</div>
                            <div className="text-xs sm:text-sm font-black text-rose-600">
                              {art.nextHargaPromo ? formatRupiah(art.nextHargaPromo) : art.nextDiskon || "-"}
                              {art.nextDiskon && art.nextHargaPromo ? (
                                <span className="ml-1 text-[10px] font-bold text-orange-700">({art.nextDiskon})</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="self-center text-slate-400 print:hidden">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Acara: <strong>{art.nextAcara || "-"}</strong></span>
                          <span>Sumber: <span className="font-mono">{art.sourceFile || "-"}</span></span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                          {art.variants.map((v) => (
                            <div key={v.sku} className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px]">
                              <div className="font-black text-slate-800">{v.color || "-"} • {v.size || "-"}</div>
                              <div className="font-mono text-[10px] text-slate-500">SKU {v.sku}</div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="font-bold text-rose-600">
                                  {v.nextHargaPromo ? formatRupiah(v.nextHargaPromo) : v.nextDiskon || "-"}
                                </span>
                                <span className="text-[10px] font-bold text-emerald-700">Stok {v.stok}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal Kamera Barcode Scanner */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Barcode className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-sm">Scan Hangtag untuk Cek POP H-2 / H-1</span>
            </div>
            <button
              type="button"
              onClick={() => setIsScanning(false)}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative">
            <TextScanner onScanResult={handleScanSuccess} />
          </div>
        </div>
      )}
    </div>
  );
}

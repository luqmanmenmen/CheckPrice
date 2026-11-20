"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Calendar,
  Search,
  Download,
  AlertTriangle,
  TrendingUp,
  Box,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ShoppingBag,
  BarChart3,
  RefreshCw,
  FileSpreadsheet,
  Sun,
  Moon,
  Zap,
  Edit3,
  Check,
  X,
  Tag,
  Info,
} from "lucide-react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PinModal } from "@/components/PinModal";
import { ChipLoader } from "@/components/ChipLoader";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const DEPT_MAP: Record<string, string> = {
  "3327": "SUKO MEN",
  "3328": "SUKO LADIES",
  "3343": "SUKO WORKWEAR",
  "3344": "SUKO ESSENTIALS",
  "3348": "SUKO SPORTS LADIES",
  "3349": "SUKO SPORTS MEN",
  "3354": "SUKO BAGS",
  "3356": "SUKO ACCS",
  "3357": "SUKO HOME LIVING",
  "3358": "SUKO TOYS",
  "3366": "SUKO CHILDREN BOYS",
  "3367": "SUKO CHILDREN GIRLS",
  "3368": "SUKO SLEEPWEAR",
  "3369": "SUKO UNDERWEAR",
  "3370": "SUKO MEN SLEEPWEAR",
  "3389": "BYRCH & CO LADIES FOOTWEAR",
  "3391": "BYRCH & CO MEN FOOTWEAR",
  "3393": "BYRCH & CO KIDS FOOTWEAR",
};

const DEPT_COLORS = [
  "#059669",
  "#6366f1",
  "#0284c7",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#0d9488",
  "#2563eb",
];

type SalesItem = {
  id: string;
  sku: string;
  description: string;
  article?: string;
  brand?: string;
  dept?: string;
  qtySold: number;
  hargaNormal: number;
  hargaPromo: number | null;
  unitPrice: number;
  status: "NORMAL" | "PROMO" | "NO_PRICE";
  itemTotal: number;
};

type DeptMetric = {
  omzet: number;
  qty: number;
  omzet_hari_ini?: number;
  qty_hari_ini?: number;
  omzet_wtd?: number;
  qty_wtd?: number;
  omzet_ytd?: number;
  qty_ytd?: number;
  stok?: number;
  eoh?: number;
  bom_unit?: number;
  boy_unit?: number;
};

type SalesData = {
  targetDate: string;
  pqUploadTime: string;
  pqFileName: string | null;
  availableDates: string[];
  cutoff?: {
    start: string;
    end: string;
    isCustom: boolean;
  };
  summary: {
    spd_omzet?: number;
    spd_qty?: number;
    yesterday_omzet?: number;
    yesterday_qty?: number;
    wtd_omzet?: number;
    wtd_qty?: number;
    mtd_omzet?: number;
    mtd_qty?: number;
    last_month_omzet?: number;
    last_month_qty?: number;
    ytd_omzet?: number;
    ytd_qty?: number;
    nilai_inventori: number;
    total_stok?: number;
    active_stock_skus?: number;
    boy_unit?: number;
    boy_retail?: number;
    bom_unit?: number;
    omzet_promo?: number;
    qty_promo?: number;
    total_produk?: number;
    total_promo?: number;
    data_source?: string;
    totalRevenue: number;
    totalPromoRevenue: number;
    totalQty: number;
    anomalyCount: number;
    totalOmzetPOS: number;
    ytd_sales_unit: number;
    mtd_omzet_pos: number;
  };
  categoryBreakdown: Record<string, DeptMetric>;
  trendData: { date: string; fullDate: string; omzet: number; qty: number }[];
  topFast: {
    sku: string;
    description: string;
    dept?: string;
    sales_qty: number;
    omzet_total: number;
  }[];
  topSlow?: {
    sku: string;
    description: string;
    article?: string;
    dept?: string;
    stok: number;
    sales_mtd: number;
  }[];
  topKritis?: {
    sku: string;
    description: string;
    article?: string;
    dept?: string;
    stok: number;
    sales_mtd: number;
  }[];
  items: SalesItem[];
};

export default function LaporanPenjualanPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeringSync, setTriggeringSync] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "1Y">("1M");
  const [activeTab, setActiveTab] = useState<"tren" | "rekonsiliasi" | "top" | "tabel">("tren");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PROMO" | "NORMAL" | "NO_PRICE">("ALL");
  const [chartMetric, setChartMetric] = useState<"omzet" | "qty">("omzet");
  const [alertPanelFilter, setAlertPanelFilter] = useState<"all" | "fast" | "kritis" | "slow">("all");
  const [showAllDepts, setShowAllDepts] = useState(false);
  const [deptBarMode, setDeptBarMode] = useState<"target" | "stok">("target");

  // Kalender Masehi 100 Tahun ke Depan (otomatis hitung kabisat 28/29/30/31 hari — tanpa perlu scrap!)
  const MONTH_NAMES_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const currentWibYear = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCFullYear();
  const YEAR_OPTIONS = useMemo(
    () => Array.from({ length: 103 }, (_, idx) => currentWibYear - 2 + idx), // 2024 s/d 2126 (100 tahun ke depan)
    [currentWibYear]
  );

  const getMonthCutoffBounds = (yearNum: number, month1To12: number) => {
    const lastDay = new Date(Date.UTC(yearNum, month1To12, 0)).getUTCDate();
    const mm = String(month1To12).padStart(2, "0");
    return {
      start: `${yearNum}-${mm}-01`,
      end: `${yearNum}-${mm}-${String(lastDay).padStart(2, "0")}`,
    };
  };

  // Mode Cut-Off Periode (Default: Tanggal 1 s/d Tanggal Berakhirnya Bulan Ini; bisa juga Cut-Off Kustom)
  const getCurrentMonthCutoffBounds = () => {
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return getMonthCutoffBounds(nowWib.getUTCFullYear(), nowWib.getUTCMonth() + 1);
  };
  const defaultCutoffBounds = getCurrentMonthCutoffBounds();
  const [cutoffMode, setCutoffMode] = useState<"monthly" | "custom">("monthly");
  const [cutoffStart, setCutoffStart] = useState<string>(defaultCutoffBounds.start);
  const [cutoffEnd, setCutoffEnd] = useState<string>(defaultCutoffBounds.end);
  const [appliedCutoff, setAppliedCutoff] = useState<{ start: string; end: string } | null>(null);

  const parsedSelectedYM = (() => {
    const base = selectedDate || defaultCutoffBounds.start;
    const m = base.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const y = m ? parseInt(m[1], 10) : currentWibYear;
    const mo = m && m[2] ? parseInt(m[2], 10) : nowWib.getUTCMonth() + 1;
    const dy = m && m[3] ? parseInt(m[3], 10) : nowWib.getUTCDate();
    return {
      year: y,
      month: Math.min(12, Math.max(1, mo)),
      day: Math.min(31, Math.max(1, dy)),
    };
  })();

  const handleSelectMonthYear = (nextYear: number, nextMonth: number) => {
    const mm = String(nextMonth).padStart(2, "0");
    const bounds = getMonthCutoffBounds(nextYear, nextMonth);
    setSelectedDate(`${nextYear}-${mm}`);
    setCutoffStart(bounds.start);
    setCutoffEnd(bounds.end);
    if (cutoffMode === "monthly") {
      setAppliedCutoff(null);
    }
  };

  const handleChangeTimeframe = (nextTf: "1D" | "1W" | "1M" | "1Y") => {
    setTimeframe(nextTf);
    const { year, month, day } = parsedSelectedYM;
    const mm = String(month).padStart(2, "0");
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dd = String(Math.min(day, maxDay)).padStart(2, "0");
    if (nextTf === "1Y") setSelectedDate(String(year));
    else if (nextTf === "1M") setSelectedDate(`${year}-${mm}`);
    else setSelectedDate(`${year}-${mm}-${dd}`);
  };

  // Theme switcher: default Clean Light Toko, bisa switch ke Executive Dark kapan saja
  const [darkMode, setDarkMode] = useState(false);

  // Target Bulanan Toko Global (disimpan di server, khusus SPV / Developer yang bisa edit agar seragam ke semua perangkat)
  const [targetMtd, setTargetMtd] = useState<number>(2000000000);
  const [targetUpdatedBy, setTargetUpdatedBy] = useState<string>("");
  const [canEditTarget, setCanEditTarget] = useState<boolean>(false);
  const [savingTarget, setSavingTarget] = useState<boolean>(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInputRp, setTargetInputRp] = useState("2.000.000.000");

  const formatRupiahDigits = (raw: string | number) => {
    const digits = String(raw ?? "").replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("id-ID");
  };

  const parseRupiahDigits = (raw: string) => {
    const digits = String(raw ?? "").replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  };

  const [showPinModal, setShowPinModal] = useState(false);
  const [exportType, setExportType] = useState<"PDF" | "CSV">("PDF");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
    actionUrl?: string;
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
    actionUrl?: string
  ) => {
    setToast({ message, type, actionUrl });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 5000);
  };

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("suko_sales_theme");
      if (savedTheme === "dark") setDarkMode(true);
    } catch {}

    // Ambil Target Toko Global dari server (sinkron ke semua HP/SPV/Crew)
    fetch("/api/admin/store-target", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && typeof j.targetMtd === "number" && j.targetMtd >= 1_000_000) {
          setTargetMtd(j.targetMtd);
          setTargetInputRp(formatRupiahDigits(j.targetMtd));
          setTargetUpdatedBy(j.updatedBy || "");
          setCanEditTarget(Boolean(j.canEdit));
        }
      })
      .catch(() => {});
  }, []);

  const toggleTheme = (nextDark: boolean) => {
    setDarkMode(nextDark);
    try {
      localStorage.setItem("suko_sales_theme", nextDark ? "dark" : "light");
    } catch {}
  };

  const handleSaveTarget = async () => {
    const val = parseRupiahDigits(targetInputRp);
    if (!Number.isFinite(val) || val < 1_000_000) {
      showToast("Target minimal Rp 1.000.000 (masukkan nominal Rupiah penuh).", "error");
      return;
    }
    setSavingTarget(true);
    try {
      const res = await fetch("/api/admin/store-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMtd: val }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setTargetMtd(json.targetMtd);
        setTargetInputRp(formatRupiahDigits(json.targetMtd));
        setTargetUpdatedBy(json.updatedBy || "");
        setEditingTarget(false);
        showToast(
          `Target Toko global diperbarui menjadi ${formatCurrency(json.targetMtd)} (otomatis menyesuaikan semua perangkat & bar departemen)!`,
          "success"
        );
      } else {
        showToast(json.error || "Gagal menyimpan target toko (khusus SPV/Developer).", "error");
      }
    } catch {
      showToast("Gagal terhubung ke server saat menyimpan target toko.", "error");
    } finally {
      setSavingTarget(false);
    }
  };

  const fetchReport = async (
    dateStr: string,
    tf: string,
    forceRefresh = false,
    customRange: { start: string; end: string } | null = appliedCutoff
  ) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const qs = new URLSearchParams({ date: dateStr, timeframe: tf });
      if (forceRefresh) qs.set("refresh", "1");
      if (customRange?.start && customRange?.end) {
        qs.set("cutoffStart", customRange.start);
        qs.set("cutoffEnd", customRange.end);
      }
      const res = await fetch(`/api/admin/sales-report?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (json.data.targetDate && json.data.targetDate !== dateStr) {
          setSelectedDate(json.data.targetDate);
        }
        if (forceRefresh) showToast("Data laporan penjualan berhasil disegarkan.", "success");
      }
    } catch (error) {
      console.error("Gagal memuat laporan penjualan:", error);
      showToast("Gagal memuat laporan penjualan. Periksa koneksi jaringan.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedDate, timeframe, false, appliedCutoff);
  }, [selectedDate, timeframe, appliedCutoff]);

  const handleSelectMonthlyCutoff = () => {
    setCutoffMode("monthly");
    setAppliedCutoff(null);
    setTimeframe("1M");
  };

  const handleApplyCustomCutoff = () => {
    if (!cutoffStart || !cutoffEnd || cutoffStart > cutoffEnd) {
      showToast("Tanggal mulai Cut-Off harus lebih awal atau sama dengan tanggal akhir.", "error");
      return;
    }
    setCutoffMode("custom");
    setAppliedCutoff({ start: cutoffStart, end: cutoffEnd });
    showToast(`Mode Cut-Off diterapkan: ${formatShortDate(cutoffStart)} – ${formatShortDate(cutoffEnd)}`, "success");
  };

  const handleTriggerSukoSalesSync = async () => {
    if (triggeringSync) return;
    setTriggeringSync(true);
    try {
      const res = await fetch("/api/admin/trigger/github-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suko-sales", force: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        showToast(
          "Mesin Python Tarik Sales & Stok SUKO sudah dinyalakan di GitHub Actions (0 RAM Supabase). Tunggu ~2-3 menit lalu klik Refresh!",
          "success",
          json.actionsUrl
        );
      } else {
        showToast(json.error || "Gagal menyalakan mesin tarik sales SUKO.", "error");
      }
    } catch {
      showToast("Gagal menghubungi server trigger GitHub Actions.", "error");
    } finally {
      setTriggeringSync(false);
    }
  };

  const formatCurrency = (amount: number = 0) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);

  const formatCompactCurrency = (amount: number = 0) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount || 0);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    if (dateStr.length === 4) return dateStr;
    if (dateStr.length === 7) {
      return new Date(dateStr + "-01").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };

  const formatCutoffDate = (dateStr: string) => {
    if (!dateStr) return "";
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return formatShortDate(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const moIdx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
    return `${m[3]} ${months[moIdx]} ${m[1]}`;
  };

  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, "0");
      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      return `${day} ${months[d.getMonth()]}`;
    } catch {
      return dateStr;
    }
  };

  // Metrik Utama Penjualan (SPD, WTD, MTD, YTD)
  const spdOmzet = data?.summary.spd_omzet ?? data?.summary.totalRevenue ?? 0;
  const spdQty = data?.summary.spd_qty ?? data?.summary.totalQty ?? 0;
  const wtdOmzet = data?.summary.wtd_omzet ?? 0;
  const wtdQty = data?.summary.wtd_qty ?? 0;
  const mtdOmzet = data?.summary.mtd_omzet ?? data?.summary.mtd_omzet_pos ?? 0;
  const mtdQty = data?.summary.mtd_qty ?? 0;
  const ytdOmzet = data?.summary.ytd_omzet ?? 0;
  const ytdQty = data?.summary.ytd_qty ?? data?.summary.ytd_sales_unit ?? 0;
  const totalStok = data?.summary.total_stok ?? 0;
  const activeStockSkus = data?.summary.active_stock_skus ?? 0;
  const nilaiInventori = data?.summary.nilai_inventori ?? 0;

  // Pertumbuhan DoD & MoM
  const yesterdayOmzet = data?.summary.yesterday_omzet ?? 0;
  const dodGrowth = yesterdayOmzet > 0 ? ((spdOmzet - yesterdayOmzet) / yesterdayOmzet) * 100 : null;
  const lastMonthOmzet = data?.summary.last_month_omzet ?? 0;
  const momGrowth = lastMonthOmzet > 0 ? ((mtdOmzet - lastMonthOmzet) / lastMonthOmzet) * 100 : null;

  const mtdProgress = targetMtd > 0 ? Math.min((mtdOmzet / targetMtd) * 100, 100) : 0;

  // Data Hero Spotlight sesuai Timeframe aktif
  const heroMeta = useMemo(() => {
    if (timeframe === "1D") {
      return {
        label: "SOROTAN OMZET HARI INI (SPD)",
        omzet: spdOmzet,
        qty: spdQty,
        growth: dodGrowth,
        growthLabel: "DoD",
      };
    }
    if (timeframe === "1W") {
      return {
        label: "SOROTAN OMZET MINGGU INI (WTD)",
        omzet: wtdOmzet,
        qty: wtdQty,
        growth: null as number | null,
        growthLabel: "WoW",
      };
    }
    if (timeframe === "1Y") {
      return {
        label: "SOROTAN OMZET TAHUN BERJALAN (YTD)",
        omzet: ytdOmzet,
        qty: ytdQty,
        growth: null as number | null,
        growthLabel: "YoY",
      };
    }
    return {
      label: "SOROTAN OMZET BULAN INI (MTD)",
      omzet: mtdOmzet,
      qty: mtdQty,
      growth: momGrowth,
      growthLabel: "MoM",
    };
  }, [timeframe, spdOmzet, spdQty, wtdOmzet, wtdQty, mtdOmzet, mtdQty, ytdOmzet, ytdQty, dodGrowth, momGrowth]);

  const heroAsp = heroMeta.qty > 0 ? Math.round(heroMeta.omzet / heroMeta.qty) : 0;

  // Ranking Departemen (diurutkan berdasarkan omzet lalu stok fisik SUKO)
  const topDeptData = useMemo(() => {
    if (!data?.categoryBreakdown) return [];
    return Object.entries(data.categoryBreakdown)
      .map(([dept, metrics], idx) => ({
        name: DEPT_MAP[dept] || dept,
        rawDept: dept,
        value: metrics.omzet || 0,
        qty: metrics.qty || 0,
        spdOmzet: metrics.omzet_hari_ini || 0,
        spdQty: metrics.qty_hari_ini || 0,
        stok: metrics.stok || 0,
        eoh: metrics.eoh || 0,
        bom_unit: metrics.bom_unit || 0,
        color: DEPT_COLORS[idx % DEPT_COLORS.length],
      }))
      .filter((d) => d.stok > 0 || d.value > 0 || d.qty > 0)
      .sort((a, b) => (b.value !== a.value ? b.value - a.value : b.stok - a.stok));
  }, [data?.categoryBreakdown]);

  const filteredDeptData = useMemo(
    () =>
      selectedDeptFilter === "ALL"
        ? topDeptData
        : topDeptData.filter((d) => d.rawDept === selectedDeptFilter || d.name === selectedDeptFilter),
    [topDeptData, selectedDeptFilter]
  );

  // Filter Items 4-Cell + Dept + Status
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const q = searchQuery.toLowerCase().trim();
    const qSpaceless = q.replace(/[\s\-_]+/g, "");

    return data.items.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (selectedDeptFilter !== "ALL") {
        const mappedDept = DEPT_MAP[item.dept || ""] || item.dept || "";
        if (item.dept !== selectedDeptFilter && mappedDept !== selectedDeptFilter) return false;
      }
      if (!q) return true;
      const desc = (item.description || "").toLowerCase();
      const sku = (item.sku || "").toLowerCase();
      const art = (item.article || "").toLowerCase();
      const brand = (item.brand || "").toLowerCase();
      const dept = (item.dept || "").toLowerCase();
      if (desc.includes(q) || sku.includes(q) || art.includes(q) || brand.includes(q) || dept.includes(q)) {
        return true;
      }
      if (qSpaceless.length >= 3) {
        const hay = `${desc} ${art} ${brand} ${dept}`.replace(/[\s\-_]+/g, "");
        if (hay.includes(qSpaceless)) return true;
      }
      return false;
    });
  }, [data?.items, searchQuery, statusFilter, selectedDeptFilter]);

  const filteredSlow = useMemo(() => {
    const list = data?.topSlow || [];
    if (selectedDeptFilter === "ALL") return list;
    return list.filter(
      (x) => x.dept === selectedDeptFilter || (DEPT_MAP[x.dept || ""] || x.dept) === selectedDeptFilter
    );
  }, [data?.topSlow, selectedDeptFilter]);

  const filteredKritis = useMemo(() => {
    const list = data?.topKritis || [];
    if (selectedDeptFilter === "ALL") return list;
    return list.filter(
      (x) => x.dept === selectedDeptFilter || (DEPT_MAP[x.dept || ""] || x.dept) === selectedDeptFilter
    );
  }, [data?.topKritis, selectedDeptFilter]);

  const filteredFast = useMemo(() => {
    const list = data?.topFast || [];
    if (selectedDeptFilter === "ALL") return list;
    return list.filter(
      (x) => !x.dept || x.dept === selectedDeptFilter || (DEPT_MAP[x.dept] || x.dept) === selectedDeptFilter
    );
  }, [data?.topFast, selectedDeptFilter]);

  // Trend stats (Peak & Average)
  const trendStats = useMemo(() => {
    const arr = data?.trendData || [];
    if (arr.length === 0) return { peak: null as any, avgOmzet: 0, avgQty: 0 };
    let peak = arr[0];
    let sumO = 0;
    let sumQ = 0;
    for (const pt of arr) {
      sumO += pt.omzet || 0;
      sumQ += pt.qty || 0;
      if ((pt.omzet || 0) > (peak.omzet || 0)) peak = pt;
    }
    return {
      peak,
      avgOmzet: sumO / arr.length,
      avgQty: Math.round(sumQ / arr.length),
    };
  }, [data?.trendData]);

  // Ekspor PDF & CSV (dengan notifikasi PIN salah yang kini tampil jelas!)
  const handleExportTrigger = (type: "PDF" | "CSV") => {
    setExportType(type);
    setShowPinModal(true);
  };

  const handleExportAuth = (pin: string) => {
    if (pin !== "220117") {
      showToast("PIN otorisasi salah! Masukkan PIN Developer yang benar untuk ekspor.", "error");
      return;
    }
    setShowPinModal(false);
    if (exportType === "PDF") executeExportPDF();
    else executeExportCSV();
  };

  const executeExportPDF = () => {
    if (!data) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Laporan Penjualan SUKO (luqman org) - ${formatDate(data.targetDate)}`, 14, 20);
    doc.setFontSize(9);
    doc.text(
      `Cut-Off: ${data.cutoff?.start || cutoffStart} s/d ${data.cutoff?.end || cutoffEnd} | Sync: ${data.pqUploadTime}`,
      14,
      27
    );
    doc.text(`Omzet Harian (SPD): ${formatCurrency(spdOmzet)} (${spdQty} pcs)`, 14, 33);
    doc.text(
      `Omzet Bulanan (MTD): ${formatCurrency(mtdOmzet)} (${mtdQty} pcs) | Stok SUKO: ${totalStok.toLocaleString("id-ID")} pcs`,
      14,
      39
    );

    const tableData = filteredItems.map((item, index) => [
      index + 1,
      item.sku,
      item.description,
      item.qtySold.toString(),
      item.status === "NO_PRICE" ? "BELUM ADA" : formatCurrency(item.unitPrice),
      item.status,
      formatCurrency(item.itemTotal),
    ]);

    autoTable(doc, {
      startY: 46,
      head: [["No", "SKU", "Nama Barang", "Qty", "Harga", "Status", "Total (Rp)"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`Laporan_Penjualan_SUKO_${data.targetDate || "terbaru"}.pdf`);
    showToast("Berkas PDF laporan penjualan berhasil diunduh.", "success");
  };

  const executeExportCSV = () => {
    if (!data) return;
    const headers = ["No", "SKU", "Departemen", "Nama Barang", "Qty Terjual", "Harga Satuan", "Status", "Total Omzet (Rp)"];
    const rows = filteredItems.map((item, idx) => [
      idx + 1,
      `="${item.sku}"`,
      `"${(item.dept || "-").replace(/"/g, '""')}"`,
      `"${item.description.replace(/"/g, '""')}"`,
      item.qtySold,
      item.unitPrice,
      item.status,
      item.itemTotal,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Laporan_Penjualan_SUKO_${data.targetDate || "terbaru"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Berkas CSV laporan penjualan berhasil diunduh.", "success");
  };

  const promoOmzetBase = Math.max(mtdOmzet, spdOmzet);
  const omzetPromoVal = data?.summary.omzet_promo || 0;
  const promoPct = promoOmzetBase > 0 ? Math.round((omzetPromoVal / promoOmzetBase) * 100) : 0;
  const piePromoData = [
    { name: "Reguler / Normal", value: Math.max(promoOmzetBase - omzetPromoVal, promoOmzetBase === 0 ? 1 : 0), color: "#3b82f6" },
    { name: "Promo Khusus", value: omzetPromoVal, color: "#10b981" },
  ];

  // Utility classes adaptif Light Toko vs Executive Dark
  const pageBg = darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900";
  const cardCls = darkMode
    ? "bg-slate-900/90 border border-slate-800 shadow-lg"
    : "bg-white border border-slate-200/90 shadow-xs";
  const softCls = darkMode
    ? "bg-slate-800/70 border border-slate-700/70"
    : "bg-slate-100/80 border border-slate-200/80";
  const textPrimary = darkMode ? "text-white" : "text-slate-900";
  const textMuted = darkMode ? "text-slate-400" : "text-slate-500";
  const borderSub = darkMode ? "border-slate-800" : "border-slate-200";
  const hoverRow = darkMode ? "hover:bg-slate-800/60" : "hover:bg-emerald-50/50";

  const hasAnySalesYet = mtdOmzet > 0 || spdOmzet > 0 || (data?.items?.length || 0) > 0;
  const totalDeptValForShare = topDeptData.reduce((s, d) => s + (hasAnySalesYet ? d.value : d.stok), 0) || 1;
  const maxDeptBar = Math.max(...topDeptData.map((d) => (hasAnySalesYet ? d.value : d.stok)), 1);

  const visibleDeptData = showAllDepts ? topDeptData : topDeptData.slice(0, 6);

  return (
    <div className={`min-h-screen overflow-x-hidden ${pageBg} px-3 py-3 sm:p-5 lg:p-6 pb-24 transition-colors duration-200 font-sans antialiased`}>
      <div className="max-w-7xl mx-auto flex flex-col gap-3.5 sm:gap-5">
        {/* ================= TOAST NOTIFIKASI (Error PIN, Sync, Refresh) ================= */}
        {toast && (
          <div
            className={`fixed bottom-4 right-3 left-3 sm:left-auto sm:right-5 sm:max-w-md z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-start justify-between gap-3 text-xs sm:text-sm font-bold ${
              toast.type === "error"
                ? "bg-rose-600 text-white border-rose-500"
                : toast.type === "success"
                ? "bg-emerald-600 text-white border-emerald-500"
                : "bg-slate-900 text-white border-slate-700"
            }`}
          >
            <div className="whitespace-normal break-words flex-1">
              <p>{toast.message}</p>
              {toast.actionUrl && (
                <a
                  href={toast.actionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1.5 underline text-emerald-100 hover:text-white"
                >
                  Lihat progres di GitHub Actions →
                </a>
              )}
            </div>
            <button onClick={() => setToast(null)} className="p-1 opacity-80 hover:opacity-100 cursor-pointer shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ================= HEADER UTAMA (Mobile-First Grid, Zero Berantakan) ================= */}
        <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col gap-3.5`}>
          {/* Baris 1: Back + Judul + Icon Theme & Refresh di pojok kanan atas */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
              <Link
                href="/super-admin"
                className={`w-10 h-10 rounded-xl ${softCls} ${textPrimary} flex items-center justify-center hover:opacity-80 transition-all shrink-0`}
                title="Kembali ke Dashboard Super Admin"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className={`font-black text-base sm:text-xl md:text-2xl leading-tight tracking-tight ${textPrimary} whitespace-normal break-words`}>
                    Laporan Penjualan SUKO
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-extrabold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 shrink-0">
                    ● luqman org Live
                  </span>
                </div>
                <p className={`text-[11px] sm:text-xs ${textMuted} mt-1 leading-snug whitespace-normal break-words`}>
                  Sync: <strong className={textPrimary}>{data?.pqUploadTime || "-"}</strong>
                  <span className="hidden sm:inline">
                    {" "}• Sumber: <strong className={textPrimary}>{data?.pqFileName || "luqman org Delta Sales (SUKO)"}</strong>
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Icon Buttons di pojok kanan atas (rapi di HP & Desktop) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => toggleTheme(!darkMode)}
                className={`h-10 px-2.5 sm:px-3 rounded-xl ${softCls} ${textPrimary} text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-85 transition-all cursor-pointer`}
                title="Ganti Tema Light / Dark"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
                <span className="hidden sm:inline">{darkMode ? "Light" : "Dark"}</span>
              </button>

              <button
                type="button"
                onClick={() => fetchReport(selectedDate, timeframe, true)}
                disabled={refreshing}
                className={`h-10 px-2.5 sm:px-3 rounded-xl ${softCls} ${textPrimary} text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-85 transition-all cursor-pointer`}
                title="Segarkan Data Laporan"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Baris 2: Aksi Utama (HP: 1 tombol utama penuh + 2 tombol Export 50/50; Desktop: sejajar rapi) */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerSukoSalesSync}
              disabled={triggeringSync}
              className="col-span-2 sm:col-span-1 h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title="Jalankan mesin Python di GitHub Actions khusus tarik stok & sales SUKO (0 beban RAM Supabase)"
            >
              <Zap className={`w-4 h-4 shrink-0 ${triggeringSync ? "animate-pulse" : ""}`} />
              <span>{triggeringSync ? "Menyalakan Mesin Python..." : "Tarik Sales SUKO Sekarang"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportTrigger("CSV")}
              className={`h-10 px-3.5 rounded-xl ${softCls} ${textPrimary} text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-85 transition-all cursor-pointer`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportTrigger("PDF")}
              className="h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Export PDF</span>
            </button>
          </div>

          {/* Baris 3: Filter Periode (4 kolom simetris penuh di HP) + Dropdown Tanggal & Dept full-width di HP */}
          <div className={`pt-3 border-t ${borderSub} flex flex-col lg:flex-row lg:items-center justify-between gap-2.5`}>
            <div className={`grid grid-cols-4 sm:inline-flex items-center p-1 rounded-xl ${softCls} gap-1 w-full lg:w-auto`}>
              {(
                [
                  ["1D", "SPD", "Harian"],
                  ["1W", "WTD", "Mingguan"],
                  ["1M", "MTD", "Bulanan"],
                  ["1Y", "YTD", "Tahunan"],
                ] as const
              ).map(([tf, shortLbl, longLbl]) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => handleChangeTimeframe(tf)}
                  className={`py-2 sm:px-3 sm:py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer text-center ${
                    timeframe === tf
                      ? "bg-emerald-600 text-white shadow-xs"
                      : `${textMuted} hover:opacity-80`
                  }`}
                >
                  <span>{shortLbl}</span>
                  <span className="hidden sm:inline font-semibold opacity-90"> ({longLbl})</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2 w-full lg:w-auto">
              <div className={`flex items-center gap-2 ${softCls} px-3 py-2 rounded-xl w-full lg:w-auto`}>
                <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                {timeframe === "1M" ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <select
                      aria-label="Pilih Bulan"
                      value={parsedSelectedYM.month}
                      onChange={(e) => handleSelectMonthYear(parsedSelectedYM.year, Number(e.target.value))}
                      className={`bg-transparent border-none text-xs font-bold ${textPrimary} focus:ring-0 cursor-pointer outline-none flex-1 min-w-0`}
                    >
                      {MONTH_NAMES_ID.map((mName, idx) => (
                        <option
                          key={mName}
                          value={idx + 1}
                          className={darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"}
                        >
                          {mName}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Pilih Tahun"
                      value={parsedSelectedYM.year}
                      onChange={(e) => handleSelectMonthYear(Number(e.target.value), parsedSelectedYM.month)}
                      className={`bg-transparent border-none text-xs font-extrabold ${textPrimary} focus:ring-0 cursor-pointer outline-none shrink-0`}
                    >
                      {YEAR_OPTIONS.map((yr) => (
                        <option
                          key={yr}
                          value={yr}
                          className={darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"}
                        >
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : timeframe === "1Y" ? (
                  <select
                    aria-label="Pilih Tahun"
                    value={parsedSelectedYM.year}
                    onChange={(e) => setSelectedDate(String(e.target.value))}
                    className={`bg-transparent border-none text-xs font-bold ${textPrimary} focus:ring-0 cursor-pointer outline-none w-full`}
                  >
                    {YEAR_OPTIONS.map((yr) => (
                      <option
                        key={yr}
                        value={yr}
                        className={darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"}
                      >
                        Tahun {yr}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    min={`${YEAR_OPTIONS[0]}-01-01`}
                    max={`${YEAR_OPTIONS[YEAR_OPTIONS.length - 1]}-12-31`}
                    value={
                      /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
                        ? selectedDate
                        : `${parsedSelectedYM.year}-${String(parsedSelectedYM.month).padStart(2, "0")}-${String(parsedSelectedYM.day).padStart(2, "0")}`
                    }
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(e.target.value);
                    }}
                    className={`bg-transparent border-none text-xs font-bold ${textPrimary} focus:ring-0 cursor-pointer outline-none w-full`}
                  />
                )}
              </div>

              <div className={`flex items-center gap-2 ${softCls} px-3 py-2 rounded-xl w-full lg:w-auto`}>
                <Tag className="w-4 h-4 text-indigo-500 shrink-0" />
                <select
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                  className={`bg-transparent border-none text-xs font-bold ${textPrimary} focus:ring-0 cursor-pointer outline-none w-full lg:max-w-[220px]`}
                >
                  <option value="ALL" className={darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"}>
                    Semua Dept SUKO ({topDeptData.length})
                  </option>
                  {topDeptData.map((d) => (
                    <option
                      key={d.rawDept}
                      value={d.rawDept}
                      className={darkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"}
                    >
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Baris 4: Mode Cut-Off Bulanan (Tgl 1 s/d Akhir Bulan) atau Cut-Off Kustom */}
          <div className={`pt-3 border-t ${borderSub} flex flex-col gap-2.5`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className={`grid grid-cols-2 sm:inline-flex p-1 rounded-xl ${softCls} gap-1 text-xs font-extrabold`}>
                <button
                  type="button"
                  onClick={handleSelectMonthlyCutoff}
                  className={`py-1.5 px-3 rounded-lg cursor-pointer transition-all text-center ${
                    cutoffMode === "monthly" ? "bg-emerald-600 text-white shadow-xs" : textMuted
                  }`}
                >
                  📅 Cut-Off Tgl 1 – Akhir Bulan
                </button>
                <button
                  type="button"
                  onClick={() => setCutoffMode("custom")}
                  className={`py-1.5 px-3 rounded-lg cursor-pointer transition-all text-center ${
                    cutoffMode === "custom" ? "bg-emerald-600 text-white shadow-xs" : textMuted
                  }`}
                >
                  ✂️ Cut-Off Kustom
                </button>
              </div>

              <div className={`text-[11px] sm:text-xs font-bold ${textMuted} flex items-center gap-1.5 flex-wrap`}>
                <span>Periode Cut-Off Aktif:</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 font-extrabold tabular-nums">
                  {formatCutoffDate(data?.cutoff?.start || cutoffStart)} – {formatCutoffDate(data?.cutoff?.end || cutoffEnd)}
                </span>
              </div>
            </div>

            {cutoffMode === "custom" && (
              <div className="grid grid-cols-2 sm:flex items-end gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold">
                  <span className={textMuted}>Dari Tanggal</span>
                  <input
                    type="date"
                    value={cutoffStart}
                    onChange={(e) => setCutoffStart(e.target.value)}
                    className={`${softCls} rounded-xl px-2.5 py-2 text-xs font-bold ${textPrimary} outline-none focus:border-emerald-500 w-full`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold">
                  <span className={textMuted}>Sampai Tanggal</span>
                  <input
                    type="date"
                    value={cutoffEnd}
                    onChange={(e) => setCutoffEnd(e.target.value)}
                    className={`${softCls} rounded-xl px-2.5 py-2 text-xs font-bold ${textPrimary} outline-none focus:border-emerald-500 w-full`}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyCustomCutoff}
                  className="col-span-2 sm:col-span-1 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer transition-all"
                >
                  Terapkan Cut-Off
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className={`flex flex-col items-center justify-center py-24 ${cardCls} rounded-3xl`}>
            <ChipLoader />
            <p className={`text-sm font-bold ${textMuted} mt-4 animate-pulse`}>
              Memuat rekap penjualan &amp; inventori SUKO (0 beban RAM Supabase)...
            </p>
          </div>
        ) : (
          <>
            {/* Banner ramah saat baru reset baseline hari ini (21 Nov 2026) */}
            {!hasAnySalesYet && (
              <div
                className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  darkMode
                    ? "bg-emerald-950/35 border-emerald-800/60 text-emerald-100"
                    : "bg-emerald-50 border-emerald-200 text-emerald-950"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm whitespace-normal break-words">
                    <p className="font-extrabold">
                      Rekap Sales Bersih luqman org Aktif Mulai 21 November 2026!
                    </p>
                    <p className={`mt-0.5 ${darkMode ? "text-emerald-200/80" : "text-emerald-800"}`}>
                      Data sales lama sudah dibersihkan. Baseline stok aktif SUKO saat ini:{" "}
                      <strong>{totalStok.toLocaleString("id-ID")} pcs</strong> ({activeStockSkus.toLocaleString("id-ID")} SKU aktif).
                      Begitu jam toko buka dan ada penjualan (lewat tombol <strong>Tarik Sales SUKO</strong> atau{" "}
                      <strong>Live Stock HP</strong>), omzet, Top 10, &amp; Stok Kritis otomatis terisi real-time.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ================= HERO REVENUE SPOTLIGHT + 4 KARTU KPI RINGKAS ================= */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
              {/* Hero Spotlight */}
              <div className="lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white shadow-lg flex flex-col justify-between gap-3.5 border border-slate-700/70">
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                      {heroMeta.label}
                    </span>
                    {heroMeta.growth !== null && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-extrabold border shrink-0 ${
                          heroMeta.growth >= 0
                            ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
                            : "bg-rose-500/20 text-rose-200 border-rose-400/30"
                        }`}
                      >
                        {heroMeta.growth >= 0 ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        {Math.abs(heroMeta.growth).toFixed(1)}% {heroMeta.growthLabel}
                      </span>
                    )}
                  </div>

                  <p className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mt-2 tabular-nums whitespace-normal break-words">
                    {formatCurrency(heroMeta.omzet)}
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3 tabular-nums">
                    <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Total Terjual</div>
                      <div className="text-sm sm:text-base font-black text-white mt-0.5">
                        {heroMeta.qty.toLocaleString("id-ID")} pcs
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/10 border border-white/10 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Rata-rata / pcs</div>
                      <div className="text-sm sm:text-base font-black text-white mt-0.5">
                        {formatCurrency(heroAsp)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Target MTD Global (khusus SPV / Developer yang bisa edit — nominal Rupiah penuh) */}
                <div className="bg-white/10 rounded-2xl p-3 border border-white/15 space-y-2">
                  {editingTarget ? (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-slate-200 whitespace-normal break-words">
                        Ubah Target Toko Global (Rupiah Penuh):
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 flex items-center rounded-xl bg-slate-900 border border-emerald-400 px-2.5 py-1.5 gap-1.5">
                          <span className="text-xs font-extrabold text-emerald-400 shrink-0">Rp</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="2.000.000.000"
                            value={targetInputRp}
                            onChange={(e) => setTargetInputRp(formatRupiahDigits(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveTarget();
                            }}
                            className="w-full min-w-0 bg-transparent text-white text-xs sm:text-sm font-bold outline-none tabular-nums"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveTarget}
                          disabled={savingTarget}
                          className="px-3 py-2 rounded-xl bg-emerald-500 disabled:opacity-60 text-slate-950 font-extrabold text-xs hover:bg-emerald-400 cursor-pointer shrink-0 flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> {savingTarget ? "Simpan..." : "Simpan"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTarget(false)}
                          className="p-2 rounded-xl bg-white/15 text-white hover:bg-white/25 cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[10px] text-emerald-200/90 tabular-nums whitespace-normal break-words">
                        Nominal: <strong>{formatCurrency(parseRupiahDigits(targetInputRp))}</strong>{" "}
                        ({formatCompactCurrency(parseRupiahDigits(targetInputRp))})
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="text-slate-200 whitespace-normal break-words">
                          Target Toko (MTD): <strong className="text-white tabular-nums">{formatCurrency(targetMtd)}</strong>
                        </span>
                        {targetUpdatedBy && (
                          <div className="text-[10px] text-slate-300/80 whitespace-normal break-words">
                            Diset oleh: {targetUpdatedBy}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-emerald-300 tabular-nums">{mtdProgress.toFixed(1)}%</span>
                        {canEditTarget && (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetInputRp(formatRupiahDigits(targetMtd));
                              setEditingTarget(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold cursor-pointer"
                            title="Edit Target Toko Global (SPV / Developer)"
                          >
                            <Edit3 className="w-3 h-3" /> Edit SPV
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="w-full h-2.5 rounded-full bg-black/35 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-300 transition-all duration-700"
                      style={{ width: `${Math.min(mtdProgress, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300 tabular-nums">
                    <span>
                      Sisa:{" "}
                      <strong className="text-white">
                        {mtdOmzet >= targetMtd ? "Tercapai!" : formatCompactCurrency(targetMtd - mtdOmzet)}
                      </strong>
                    </span>
                    <span>
                      Promo: <strong className="text-emerald-300">{promoPct}%</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Supporting KPI Cards (2x2 Grid rapi & proporsional di HP 360px) */}
              <div className="lg:col-span-7 grid grid-cols-2 gap-2.5 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setTimeframe("1D")}
                  className={`text-left ${cardCls} rounded-2xl p-3.5 sm:p-4 hover:border-emerald-500 transition-all cursor-pointer flex flex-col justify-between gap-2`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${textMuted}`}>SPD Hari Ini</span>
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className={`text-lg sm:text-2xl font-black leading-tight ${textPrimary} tabular-nums whitespace-normal break-words`}>
                      {formatCompactCurrency(spdOmzet)}
                    </p>
                    <p className={`text-[11px] sm:text-xs ${textMuted} tabular-nums`}>
                      <strong className={textPrimary}>{spdQty.toLocaleString("id-ID")} pcs</strong>
                    </p>
                    {dodGrowth !== null && (
                      <p className={`text-[11px] font-bold tabular-nums ${dodGrowth >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {dodGrowth >= 0 ? "↗ +" : "↘ "}
                        {Math.abs(dodGrowth).toFixed(1)}% DoD
                      </p>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTimeframe("1W")}
                  className={`text-left ${cardCls} rounded-2xl p-3.5 sm:p-4 hover:border-blue-500 transition-all cursor-pointer flex flex-col justify-between gap-2`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${textMuted}`}>WTD Minggu</span>
                    <div className="w-7 h-7 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
                      <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className={`text-lg sm:text-2xl font-black leading-tight ${textPrimary} tabular-nums whitespace-normal break-words`}>
                      {formatCompactCurrency(wtdOmzet)}
                    </p>
                    <p className={`text-[11px] sm:text-xs ${textMuted} tabular-nums`}>
                      <strong className={textPrimary}>{wtdQty.toLocaleString("id-ID")} pcs</strong> terjual
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTimeframe("1Y")}
                  className={`text-left ${cardCls} rounded-2xl p-3.5 sm:p-4 hover:border-purple-500 transition-all cursor-pointer flex flex-col justify-between gap-2`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${textMuted}`}>YTD Tahun Ini</span>
                    <div className="w-7 h-7 rounded-xl bg-purple-500/15 text-purple-600 flex items-center justify-center shrink-0">
                      <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className={`text-lg sm:text-2xl font-black leading-tight ${textPrimary} tabular-nums whitespace-normal break-words`}>
                      {formatCompactCurrency(ytdOmzet)}
                    </p>
                    <p className={`text-[11px] sm:text-xs ${textMuted} tabular-nums`}>
                      <strong className={textPrimary}>{ytdQty.toLocaleString("id-ID")} pcs</strong> terjual
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("rekonsiliasi")}
                  className={`text-left ${cardCls} rounded-2xl p-3.5 sm:p-4 hover:border-cyan-500 transition-all cursor-pointer flex flex-col justify-between gap-2`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${textMuted}`}>Stok SUKO</span>
                    <div className="w-7 h-7 rounded-xl bg-cyan-500/15 text-cyan-600 flex items-center justify-center shrink-0">
                      <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className={`text-lg sm:text-2xl font-black leading-tight ${textPrimary} tabular-nums whitespace-normal break-words`}>
                      {formatCompactCurrency(nilaiInventori)}
                    </p>
                    <p className={`text-[11px] sm:text-xs ${textMuted} tabular-nums`}>
                      <strong className={textPrimary}>{totalStok.toLocaleString("id-ID")} pcs</strong> fisik
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* ================= NAVIGASI TAB SIMETRIS (2x2 di HP, 4x1 di Desktop) ================= */}
            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-2xl ${softCls}`}>
              {(
                [
                  ["tren", "📈 Tren & Dept"],
                  ["rekonsiliasi", "🔄 Rekonsiliasi"],
                  ["top", `⚡ Top & Alert (${filteredKritis.length})`],
                  ["tabel", `📋 Rincian (${filteredItems.length})`],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer text-center flex items-center justify-center ${
                    activeTab === tabKey
                      ? "bg-emerald-600 text-white shadow-sm"
                      : `${textMuted} hover:opacity-80`
                  }`}
                >
                  <span className="whitespace-normal break-words leading-tight">{label}</span>
                </button>
              ))}
            </div>

            {/* ================= TAB 1: TREN & DEPARTEMEN ================= */}
            {activeTab === "tren" && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-7 flex flex-col gap-5">
                  {/* Area Chart Tren Harian */}
                  <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div>
                        <h2 className={`font-extrabold text-base sm:text-lg ${textPrimary}`}>
                          Tren Penjualan Harian (SUKO luqman org)
                        </h2>
                        <p className={`text-xs ${textMuted} mt-0.5`}>
                          Puncak:{" "}
                          <strong className="text-emerald-600">
                            {trendStats.peak ? formatCompactCurrency(trendStats.peak.omzet) : "Rp 0"}
                          </strong>{" "}
                          • Rata-rata:{" "}
                          <strong className={textPrimary}>
                            {chartMetric === "omzet"
                              ? `${formatCompactCurrency(trendStats.avgOmzet)}/hari`
                              : `${trendStats.avgQty.toLocaleString("id-ID")} pcs/hari`}
                          </strong>
                        </p>
                      </div>

                      <div className={`inline-flex p-1 rounded-xl ${softCls} text-xs font-bold`}>
                        <button
                          type="button"
                          onClick={() => setChartMetric("omzet")}
                          className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                            chartMetric === "omzet" ? "bg-emerald-600 text-white" : textMuted
                          }`}
                        >
                          Omzet (Rp)
                        </button>
                        <button
                          type="button"
                          onClick={() => setChartMetric("qty")}
                          className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                            chartMetric === "qty" ? "bg-emerald-600 text-white" : textMuted
                          }`}
                        >
                          Qty (Pcs)
                        </button>
                      </div>
                    </div>

                    <div className="h-[210px] sm:h-[260px] w-full">
                      {data?.trendData && data.trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={data.trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="omzetGradientNew" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke={darkMode ? "#1e293b" : "#e2e8f0"}
                            />
                            <XAxis
                              dataKey="fullDate"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: darkMode ? "#94a3b8" : "#64748b" }}
                              tickFormatter={formatShortDate}
                              dy={6}
                            />
                            <YAxis
                              width={48}
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: darkMode ? "#94a3b8" : "#64748b" }}
                              tickFormatter={(val) =>
                                chartMetric === "omzet" ? formatCompactCurrency(val) : `${val}`
                              }
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const pt = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900/95 p-3.5 rounded-2xl shadow-xl border border-slate-700 text-white text-xs">
                                      <p className="text-slate-400 font-bold uppercase mb-1">
                                        {formatShortDate(pt.fullDate)}
                                      </p>
                                      <p className="text-emerald-400 font-black text-base tabular-nums">
                                        {formatCurrency(pt.omzet)}
                                      </p>
                                      <p className="text-slate-200 font-bold mt-0.5 tabular-nums">
                                        {pt.qty?.toLocaleString("id-ID") || 0} pcs terjual
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey={chartMetric}
                              stroke="#10b981"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#omzetGradientNew)"
                              activeDot={{ r: 6, fill: "#10b981", stroke: darkMode ? "#0f172a" : "#ffffff", strokeWidth: 3 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${textMuted} text-sm ${softCls} rounded-2xl`}>
                          Belum ada transaksi terekam pada periode ini.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Donut Promo vs Reguler + Kesehatan Data */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-5 flex flex-col justify-between gap-4`}>
                      <div>
                        <h3 className={`font-extrabold text-sm sm:text-base ${textPrimary}`}>
                          Proporsi Promo vs Reguler
                        </h3>
                        <p className={`text-xs ${textMuted} mt-0.5`}>Kontribusi penjualan promo aktif</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-28 h-28 relative shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={piePromoData}
                                cx="50%"
                                cy="50%"
                                innerRadius={36}
                                outerRadius={50}
                                paddingAngle={4}
                                dataKey="value"
                                stroke="none"
                              >
                                {piePromoData.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className={`text-lg font-black ${textPrimary}`}>{promoPct}%</span>
                            <span className="text-[10px] font-extrabold text-emerald-600 uppercase">Promo</span>
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 space-y-2 text-xs">
                          <div className={`${softCls} rounded-xl p-2.5`}>
                            <div className={`flex items-center gap-1.5 font-bold ${textPrimary}`}>
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                              Reguler
                            </div>
                            <p className={`font-black text-sm mt-0.5 tabular-nums ${textPrimary}`}>
                              {formatCompactCurrency(Math.max(promoOmzetBase - omzetPromoVal, 0))}
                            </p>
                          </div>
                          <div className={`${softCls} rounded-xl p-2.5`}>
                            <div className={`flex items-center gap-1.5 font-bold ${textPrimary}`}>
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                              Promo Khusus
                            </div>
                            <p className="font-black text-sm mt-0.5 tabular-nums text-emerald-600">
                              {formatCompactCurrency(omzetPromoVal)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-5 flex flex-col justify-between gap-3`}>
                      <div>
                        <h3 className={`font-extrabold text-sm sm:text-base ${textPrimary}`}>
                          Kesehatan Katalog &amp; Sumber
                        </h3>
                        <p className={`text-xs ${textMuted} mt-0.5`}>Agregasi Python CDN (0 beban RAM Supabase)</p>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className={`flex items-center justify-between p-2.5 rounded-xl ${softCls}`}>
                          <span className={textMuted}>SKU SUKO Berstok Aktif</span>
                          <strong className={`${textPrimary} tabular-nums`}>
                            {(activeStockSkus || 0).toLocaleString("id-ID")} SKU
                          </strong>
                        </div>
                        <div className={`flex items-center justify-between p-2.5 rounded-xl ${softCls}`}>
                          <span className={textMuted}>Artikel Promo Aktif</span>
                          <strong className="text-emerald-600 tabular-nums">
                            {(data?.summary.total_promo || 0).toLocaleString("id-ID")}
                          </strong>
                        </div>
                        <div className={`flex items-center justify-between p-2.5 rounded-xl ${softCls}`}>
                          <span className={textMuted}>Status Sumber Data</span>
                          <span className="font-extrabold text-emerald-600 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> luqman org + Excel
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kolom Kanan: Progress Departemen Mengacu pada Target Toko Global (Default) atau Sebaran Stok */}
                <div className={`xl:col-span-5 ${cardCls} rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col gap-3.5`}>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className={`font-extrabold text-base sm:text-lg ${textPrimary} whitespace-normal break-words`}>
                          {deptBarMode === "target"
                            ? `Kontribusi Dept vs Target (${formatCompactCurrency(targetMtd)})`
                            : "Sebaran Stok SUKO per Departemen"}
                        </h2>
                        <p className={`text-xs ${textMuted} mt-0.5 whitespace-normal break-words`}>
                          {deptBarMode === "target"
                            ? `Bar mengacu langsung pada Target Toko ${formatCurrency(targetMtd)} • Ketuk dept untuk filter`
                            : "Porsi stok fisik SUKO per departemen • Ketuk dept untuk filter"}
                        </p>
                      </div>
                      {selectedDeptFilter !== "ALL" && (
                        <button
                          type="button"
                          onClick={() => setSelectedDeptFilter("ALL")}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 text-xs font-extrabold cursor-pointer shrink-0"
                        >
                          ✕ Reset
                        </button>
                      )}
                    </div>

                    {/* Switch Mode Bar Departemen: vs Target Toko (Default) | Sebaran Stok */}
                    <div className={`grid grid-cols-2 p-1 rounded-xl ${softCls} gap-1 text-xs font-extrabold`}>
                      <button
                        type="button"
                        onClick={() => setDeptBarMode("target")}
                        className={`py-1.5 px-2.5 rounded-lg cursor-pointer transition-all ${
                          deptBarMode === "target" ? "bg-emerald-600 text-white shadow-xs" : textMuted
                        }`}
                      >
                        🎯 vs Target ({formatCompactCurrency(targetMtd)})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeptBarMode("stok")}
                        className={`py-1.5 px-2.5 rounded-lg cursor-pointer transition-all ${
                          deptBarMode === "stok" ? "bg-emerald-600 text-white shadow-xs" : textMuted
                        }`}
                      >
                        📦 Porsi Stok Fisik
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 xl:max-h-[540px] xl:overflow-y-auto xl:pr-1">
                    {visibleDeptData.map((d, idx) => {
                      const isTargetMode = deptBarMode === "target";
                      const targetPctRaw = targetMtd > 0 ? (d.value / targetMtd) * 100 : 0;
                      const stokShareRaw = totalStok > 0 ? (d.stok / totalStok) * 100 : 0;
                      const displayPct = isTargetMode ? targetPctRaw : stokShareRaw;
                      const barPct = isTargetMode
                        ? Math.min(100, targetPctRaw)
                        : Math.min(100, stokShareRaw);
                      const isSelected = selectedDeptFilter === d.rawDept || selectedDeptFilter === d.name;

                      return (
                        <button
                          key={d.rawDept}
                          type="button"
                          onClick={() => setSelectedDeptFilter(isSelected ? "ALL" : d.rawDept)}
                          className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-emerald-500/15 border-emerald-500"
                              : `${softCls} hover:border-emerald-500/50`
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5 text-xs">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              <span
                                className="w-5 h-5 rounded-md text-white font-black flex items-center justify-center shrink-0 text-[11px]"
                                style={{ backgroundColor: d.color }}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <span className={`font-extrabold ${textPrimary} whitespace-normal break-words block`}>
                                  {d.name}
                                </span>
                                <span className={`text-[11px] ${textMuted} tabular-nums`}>
                                  Stok {d.stok.toLocaleString("id-ID")} pcs • EOH {formatCompactCurrency(d.eoh)}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0 tabular-nums">
                              <div className={`font-black ${textPrimary}`}>
                                {isTargetMode
                                  ? formatCompactCurrency(d.value)
                                  : `${d.stok.toLocaleString("id-ID")} pcs`}
                              </div>
                              <div className={`text-[11px] font-bold ${isTargetMode ? "text-emerald-600" : textMuted}`}>
                                {displayPct.toFixed(1)}% {isTargetMode ? "dr Target" : "dr Stok"}
                              </div>
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-400/20 mt-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${barPct}%`, backgroundColor: d.color }}
                            />
                          </div>
                        </button>
                      );
                    })}
                    {topDeptData.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setShowAllDepts((v) => !v)}
                        className={`w-full py-2.5 rounded-xl ${softCls} ${textPrimary} text-xs font-extrabold hover:opacity-85 transition-all cursor-pointer`}
                      >
                        {showAllDepts
                          ? "Tampilkan Lebih Ringkas (6 Teratas)"
                          : `Lihat Semua Departemen (${topDeptData.length})`}
                      </button>
                    )}
                    {topDeptData.length === 0 && (
                      <div className={`p-8 text-center text-xs ${textMuted} ${softCls} rounded-2xl`}>
                        Belum ada data departemen SUKO.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 2: REKONSILIASI STOK (Desktop Table + Mobile Card View) ================= */}
            {activeTab === "rekonsiliasi" && (
              <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className={`font-extrabold text-base sm:text-lg ${textPrimary}`}>
                      Rekonsiliasi Pergerakan Stok SUKO (BOM → Terjual → EOH)
                    </h2>
                    <p className={`text-xs ${textMuted} mt-0.5`}>
                      Baseline stok awal dihitung mulai 21 Nov 2026 khusus produk aktif SUKO (MUKU &amp; ZES dikecualikan)
                    </p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-xl ${softCls} text-xs font-bold ${textPrimary} self-start sm:self-auto`}>
                    Total Sisa EOH: <strong className="text-emerald-600">{totalStok.toLocaleString("id-ID")} pcs</strong>
                  </span>
                </div>

                {/* Desktop Table */}
                <div className={`hidden md:block overflow-x-auto rounded-2xl border ${borderSub}`}>
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className={`${softCls} ${textMuted} uppercase text-[11px] font-extrabold`}>
                      <tr>
                        <th className="p-3.5">Departemen Ritel</th>
                        <th className="p-3.5 text-right">Stok Awal (BOM)</th>
                        <th className="p-3.5 text-right">Terjual MTD</th>
                        <th className="p-3.5 text-right">Sisa EOH</th>
                        <th className="p-3.5 text-center">Sell-Through</th>
                        <th className="p-3.5 text-right">Omzet MTD</th>
                        <th className="p-3.5 text-right">Valuasi EOH</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${borderSub}`}>
                      {filteredDeptData.map((d) => {
                        const sellThrough = d.bom_unit > 0 ? ((d.qty / d.bom_unit) * 100).toFixed(1) : "0.0";
                        return (
                          <tr key={d.rawDept} className={`${hoverRow} transition-colors`}>
                            <td className={`p-3.5 font-extrabold ${textPrimary} whitespace-normal break-words`}>
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                                style={{ backgroundColor: d.color }}
                              />
                              {d.name}
                            </td>
                            <td className={`p-3.5 text-right tabular-nums ${textMuted}`}>
                              {d.bom_unit.toLocaleString("id-ID")}
                            </td>
                            <td className="p-3.5 text-right tabular-nums font-bold text-emerald-600">
                              {d.qty.toLocaleString("id-ID")} pcs
                            </td>
                            <td className="p-3.5 text-right tabular-nums font-bold text-cyan-600">
                              {d.stok.toLocaleString("id-ID")} pcs
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 tabular-nums">
                                {sellThrough}%
                              </span>
                            </td>
                            <td className={`p-3.5 text-right tabular-nums font-black ${textPrimary}`}>
                              {formatCurrency(d.value)}
                            </td>
                            <td className={`p-3.5 text-right tabular-nums ${textMuted}`}>
                              {formatCurrency(d.eoh)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card Stack (Bebas scroll menyamping) */}
                <div className="grid grid-cols-1 gap-3 md:hidden">
                  {filteredDeptData.map((d) => {
                    const sellThrough = d.bom_unit > 0 ? ((d.qty / d.bom_unit) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={d.rawDept} className={`${softCls} rounded-2xl p-3.5 space-y-2.5 text-xs`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                              style={{ backgroundColor: d.color }}
                            />
                            <strong className={`${textPrimary} font-extrabold whitespace-normal break-words`}>
                              {d.name}
                            </strong>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-extrabold shrink-0 tabular-nums">
                            ST {sellThrough}%
                          </span>
                        </div>
                        <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${borderSub} text-center tabular-nums`}>
                          <div>
                            <div className={textMuted}>BOM</div>
                            <strong className={textPrimary}>{d.bom_unit.toLocaleString("id-ID")}</strong>
                          </div>
                          <div>
                            <div className={textMuted}>Terjual</div>
                            <strong className="text-emerald-600">{d.qty.toLocaleString("id-ID")}</strong>
                          </div>
                          <div>
                            <div className={textMuted}>Sisa EOH</div>
                            <strong className="text-cyan-600">{d.stok.toLocaleString("id-ID")}</strong>
                          </div>
                        </div>
                        <div className={`flex items-center justify-between pt-2 border-t ${borderSub} tabular-nums`}>
                          <span className={textMuted}>
                            Omzet MTD: <strong className={textPrimary}>{formatCompactCurrency(d.value)}</strong>
                          </span>
                          <span className={textMuted}>
                            Valuasi: <strong className={textPrimary}>{formatCompactCurrency(d.eoh)}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================= TAB 3: TOP BEST SELLER, STOK KRITIS & SLOW MOVING ================= */}
            {activeTab === "top" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["all", "Semua Panel"],
                      ["fast", `🏆 Best Seller (${filteredFast.length})`],
                      ["kritis", `🚨 Kritis (${filteredKritis.length})`],
                      ["slow", `🐢 Slow Move (${filteredSlow.length})`],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAlertPanelFilter(k)}
                      className={`py-2 px-2.5 sm:px-3 rounded-xl text-xs font-extrabold cursor-pointer transition-all text-center ${
                        alertPanelFilter === k ? "bg-emerald-600 text-white shadow-xs" : `${softCls} ${textMuted}`
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <div
                  className={`grid grid-cols-1 ${
                    alertPanelFilter === "all" ? "lg:grid-cols-3" : "lg:grid-cols-1"
                  } gap-4`}
                >
                  {/* 1. TOP 10 BEST SELLER */}
                  {(alertPanelFilter === "all" || alertPanelFilter === "fast") && (
                    <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col gap-3.5`}>
                      <div className={`flex items-center justify-between gap-2 pb-3 border-b ${borderSub}`}>
                        <div>
                          <h2 className={`font-extrabold text-sm sm:text-base ${textPrimary} flex items-center gap-2`}>
                            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" /> Top 10 Best Seller
                          </h2>
                          <p className={`text-xs ${textMuted} mt-0.5`}>Produk SUKO terlaris periode aktif</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 text-xs font-extrabold shrink-0">
                          Fast
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {filteredFast.length > 0 ? (
                          filteredFast.slice(0, 10).map((item, idx) => (
                            <div key={item.sku + idx} className={`${softCls} rounded-2xl p-3 space-y-2`}>
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                    idx === 0
                                      ? "bg-amber-500/20 text-amber-600"
                                      : idx === 1
                                      ? "bg-slate-400/25 text-slate-600"
                                      : idx === 2
                                      ? "bg-orange-500/20 text-orange-600"
                                      : "bg-slate-500/15 text-slate-500"
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs sm:text-sm font-bold ${textPrimary} leading-snug whitespace-normal break-words`}>
                                    {item.description}
                                  </p>
                                  <p className={`text-[11px] ${textMuted} font-mono mt-0.5`}>
                                    SKU: {item.sku} {item.dept ? `• ${item.dept}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className={`flex items-center justify-between pt-2 border-t ${borderSub} text-xs tabular-nums`}>
                                <strong className="text-emerald-600 font-black">{formatCurrency(item.omzet_total)}</strong>
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 font-bold">
                                  {item.sales_qty} pcs
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className={`p-6 text-center text-xs ${textMuted} ${softCls} rounded-2xl whitespace-normal break-words`}>
                            Belum ada transaksi terjual sejak reset baseline 21 Nov 2026. Klik <strong>Tarik Sales SUKO</strong> di jam buka toko untuk merekam penjualan.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 2. STOK KRITIS */}
                  {(alertPanelFilter === "all" || alertPanelFilter === "kritis") && (
                    <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col gap-3.5 border-rose-500/35`}>
                      <div className={`flex items-center justify-between gap-2 pb-3 border-b ${borderSub}`}>
                        <div>
                          <h2 className={`font-extrabold text-sm sm:text-base ${textPrimary} flex items-center gap-2`}>
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" /> Stok Kritis (Segera PO)
                          </h2>
                          <p className={`text-xs ${textMuted} mt-0.5`}>Laku terjual namun sisa stok &le; 5 pcs</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 text-xs font-extrabold shrink-0">
                          Urgent
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {filteredKritis.length > 0 ? (
                          filteredKritis.slice(0, 10).map((item, idx) => (
                            <div
                              key={item.sku + idx}
                              className={`rounded-2xl p-3 space-y-2 border ${
                                darkMode
                                  ? "bg-rose-950/25 border-rose-900/50"
                                  : "bg-rose-50/70 border-rose-200/80"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className={`text-xs sm:text-sm font-bold ${textPrimary} leading-snug whitespace-normal break-words`}>
                                  {item.description}
                                </p>
                                <p className={`text-[11px] ${textMuted} font-mono mt-0.5`}>
                                  SKU: {item.sku} • {item.dept || "SUKO"}
                                </p>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-rose-500/20 text-xs tabular-nums">
                                <span
                                  className={`px-2 py-0.5 rounded-lg font-black ${
                                    item.stok === 0
                                      ? "bg-rose-600 text-white"
                                      : "bg-amber-500/20 text-amber-700"
                                  }`}
                                >
                                  Sisa {item.stok} pcs
                                </span>
                                <span className={`font-bold ${textPrimary}`}>
                                  Laku {item.sales_mtd} pcs MTD
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className={`p-6 text-center text-xs ${textMuted} ${softCls} rounded-2xl whitespace-normal break-words`}>
                            Belum ada produk SUKO berstatus stok kritis saat ini.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. SLOW MOVING */}
                  {(alertPanelFilter === "all" || alertPanelFilter === "slow") && (
                    <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col gap-3.5 border-amber-500/35`}>
                      <div className={`flex items-center justify-between gap-2 pb-3 border-b ${borderSub}`}>
                        <div>
                          <h2 className={`font-extrabold text-sm sm:text-base ${textPrimary} flex items-center gap-2`}>
                            <Box className="w-4 h-4 text-amber-500 shrink-0" /> Slow Moving (Stok Mengendap)
                          </h2>
                          <p className={`text-xs ${textMuted} mt-0.5`}>Stok SUKO tinggi (&ge;10 pcs), penjualan lambat</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 text-xs font-extrabold shrink-0">
                          Display
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {filteredSlow.length > 0 ? (
                          filteredSlow.slice(0, 10).map((item, idx) => (
                            <div
                              key={item.sku + idx}
                              className={`rounded-2xl p-3 space-y-2 border ${
                                darkMode
                                  ? "bg-amber-950/20 border-amber-900/50"
                                  : "bg-amber-50/70 border-amber-200/80"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className={`text-xs sm:text-sm font-bold ${textPrimary} leading-snug whitespace-normal break-words`}>
                                  {item.description}
                                </p>
                                <p className={`text-[11px] ${textMuted} font-mono mt-0.5`}>
                                  SKU: {item.sku} • {item.dept || "SUKO"}
                                </p>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-amber-500/20 text-xs tabular-nums">
                                <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-700 font-black">
                                  Stok {item.stok} pcs
                                </span>
                                <span className={textMuted}>
                                  Laku <strong className={textPrimary}>{item.sales_mtd} pcs</strong> MTD
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className={`p-6 text-center text-xs ${textMuted} ${softCls} rounded-2xl`}>
                            Tidak ada barang slow moving yang mengkhawatirkan.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 4: RINCIAN PRODUK SKU (Desktop Table + Mobile Card View) ================= */}
            {activeTab === "tabel" && (
              <div className={`${cardCls} rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                    <input
                      type="text"
                      placeholder="Cari 4-Cell: SKU, Artikel, Nama Barang, Brand, Dept..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full ${softCls} rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm font-medium ${textPrimary} outline-none focus:border-emerald-500`}
                    />
                  </div>

                  <div className="grid grid-cols-4 sm:flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold w-full md:w-auto">
                    {(
                      [
                        ["ALL", "Semua"],
                        ["PROMO", "Promo"],
                        ["NORMAL", "Reguler"],
                        ["NO_PRICE", "No Price"],
                      ] as const
                    ).map(([st, lbl]) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`py-2 px-2 sm:px-3 rounded-xl cursor-pointer transition-all text-center ${
                          statusFilter === st ? "bg-emerald-600 text-white" : `${softCls} ${textMuted}`
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div className={`p-10 text-center text-xs sm:text-sm ${textMuted} ${softCls} rounded-2xl whitespace-normal break-words`}>
                    Belum ada rincian produk terjual yang cocok pada periode ini.
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className={`hidden md:block overflow-x-auto rounded-2xl border ${borderSub}`}>
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead className={`${softCls} ${textMuted} text-[11px] uppercase tracking-wider font-extrabold`}>
                          <tr>
                            <th className="p-3.5">SKU &amp; Deskripsi Barang (Utuh)</th>
                            <th className="p-3.5 text-center">Qty</th>
                            <th className="p-3.5 text-right">Harga Satuan</th>
                            <th className="p-3.5 text-center">Status</th>
                            <th className="p-3.5 text-right">Total Omzet</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${borderSub}`}>
                          {filteredItems.slice(0, 100).map((item) => (
                            <tr key={item.id} className={`${hoverRow} transition-colors`}>
                              <td className="p-3.5">
                                <div className="flex flex-col gap-0.5">
                                  <span className={`font-bold ${textPrimary} font-mono`}>
                                    {item.sku}{" "}
                                    {item.dept && (
                                      <span className={`font-sans font-semibold text-xs ${textMuted}`}>
                                        • {item.dept}
                                      </span>
                                    )}
                                  </span>
                                  <span className={`text-xs ${textMuted} whitespace-normal break-words`}>
                                    {item.description}
                                  </span>
                                </div>
                              </td>
                              <td className={`p-3.5 text-center font-bold ${textPrimary} tabular-nums`}>
                                {item.qtySold}
                              </td>
                              <td className={`p-3.5 text-right font-semibold ${textPrimary} tabular-nums`}>
                                {formatCurrency(item.unitPrice)}
                              </td>
                              <td className="p-3.5 text-center">
                                <span
                                  className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                    item.status === "PROMO"
                                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                      : item.status === "NO_PRICE"
                                      ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
                                      : "bg-blue-500/15 text-blue-600 border-blue-500/30"
                                  }`}
                                >
                                  {item.status === "NO_PRICE" ? "NO PRICE" : item.status}
                                </span>
                              </td>
                              <td className="p-3.5 text-right font-black text-emerald-600 tabular-nums">
                                {formatCurrency(item.itemTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card Stack */}
                    <div className="grid grid-cols-1 gap-2.5 md:hidden">
                      {filteredItems.slice(0, 100).map((item) => (
                        <div key={item.id} className={`${softCls} rounded-2xl p-3.5 space-y-2 text-xs`}>
                          <div className="flex items-start justify-between gap-2">
                            <span className={`font-mono font-bold ${textPrimary}`}>
                              {item.sku} {item.dept ? `• ${item.dept}` : ""}
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                                item.status === "PROMO"
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : item.status === "NO_PRICE"
                                  ? "bg-rose-500/15 text-rose-600"
                                  : "bg-blue-500/15 text-blue-600"
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className={`${textPrimary} font-semibold whitespace-normal break-words`}>
                            {item.description}
                          </p>
                          <div className={`flex items-center justify-between pt-2 border-t ${borderSub} tabular-nums`}>
                            <span className={textMuted}>
                              {item.qtySold} pcs × {formatCurrency(item.unitPrice)}
                            </span>
                            <strong className="text-emerald-600 font-black">{formatCurrency(item.itemTotal)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredItems.length > 100 && (
                      <div className={`p-3 text-center text-xs font-bold ${textMuted} ${softCls} rounded-xl`}>
                        Menampilkan 100 data teratas dari total {filteredItems.length} item terjual.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Security Pin Modal untuk Export PDF / CSV */}
        <PinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          onSubmit={handleExportAuth}
          title="Otorisasi Ekspor Data"
          description={`Masukkan PIN Keamanan Developer untuk mengunduh berkas ${exportType}.`}
        />
      </div>
    </div>
  );
}

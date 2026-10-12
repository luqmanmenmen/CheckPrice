# Walkthrough: Catatan Rombakan Lengkap — Python Data Engine, UI/UX Laporan Penjualan & Smart Search 4-Cell

Dokumen ini mendokumentasikan secara menyeluruh setiap perombakan sistem, arsitektur data, perbaikan algoritma, dan konfigurasi live produksi pada proyek **Price Checker & Retail Intelligence Platform** (`c:\Max Display\price-checker`).

---

## 1. Daftar Berkas yang Dirombak

| No | Berkas | Status | Ringkasan Perombakan |
| :--- | :--- | :--- | :--- |
| 1 | [`python-engine/parser.py`](file:///c:/Max%20Display/price-checker/python-engine/parser.py) | **Dirombak** | 1. Pra-deteksi header baris 4 sebelum konsultasi Gemini AI (mencegah `UNNAMED: 2`).<br/>2. Ekstraksi penuh 4-cell: `col_group`, `col_dept`, `col_parent`, `col_desc`.<br/>3. Sanitasi `clean_number()` untuk format tanda kutip/spasi (`" 215,946 "` & `" - "`).<br/>4. Vektorisasi *Pivot Table Engine* (GroupBy SKU: SUM sales/stok, FIRST teks). |
| 2 | [`python-engine/main.py`](file:///c:/Max%20Display/price-checker/python-engine/main.py) | **Dirombak** | Memperbaiki hierarki penugasan `dept` agar nilai riil dari PQ tidak pernah tertimpa oleh fallback lama (`DEPARTEMEN LAINNYA`). |
| 3 | [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts) | **Dirombak** | 1. Agregasi metrik ritel eksekutif: SPD, WTD, MTD, YTD, BOM, BOY, EOH, dan Valuasi Inventori.<br/>2. Perhitungan otomatis Day-over-Day (`yesterdayOmzet`) dan Month-over-Month (`lastMonthOmzet`).<br/>3. Pengayaan data rincian item dengan 4 atribut: `article`, `brand`, `dept`, `description`. |
| 4 | [`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx) | **Dirombak Total** | Desain ulang UI/UX menjadi **Executive Retail Analytics Dashboard** dengan 5 KPI Cards, 4 Tab Navigasi, Chart Recharts, Alert Stok Kritis/Slow Moving, dan Ekspor PDF (PIN 220117) & CSV. |
| 5 | [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/[identifier]/route.ts) | **Dirombak** | Integrasi 4-Cell Smart Search (`GROUP`, `DEPARTMENT`, `PARENT_NAME`, `ITEM_DESCRIPTION`) dengan pembobotan multi-tier (Exact, Prefix, Spaceless, Multi-token). |
| 6 | Database PostgreSQL (Supabase) | **Dimutakhirkan** | Sinkronisasi data departemen asli dari CSV Power Query (semua 23 SKU NAYOUNG kini berstatus `dept = 'NAYOUNG'` dan `brand = 'LOCAL BRAND'`). |

---

## 2. Analisis Struktur Power Query (PQ 10 Oktober 2026)

* **Sumber File**: `POWER QUERY 10 OKTOBER 2026.csv` (52.546 baris mentah).
* **Metadata & Header**:
  * Baris 1: `DATA_AS_OF,10/7/2026` (Metadata tanggal cut-off).
  * Baris 2–3: Spasi kosong / label agregat Excel.
  * Baris 4: **Header Ritel Sejati (26 Kolom)**:
    `GROUP`, `DEPARTMENT`, `PARENT_NAME`, `ITEM_DESCRIPTION`, `SKU`, `COLOR`, `SIZE`, `LAST_PURCHASE_DATE`, `EOH UNIT`, `EOH RETAIL`, `DAY SALES UNIT`, `DAY SALES RETAIL`, `WTD SALES UNIT`, `WTD SALES RETAIL`, `MTD SALES UNIT`, `MTD SALES RETAIL`, `YTD SALES UNIT`, `YTD SALES RETAIL`, `BOY UNIT`, `BOY RETAIL`, `BOM UNIT`, `BOM RETAIL`, `NORMAL`, `HARGA PROMO`, `DISKON`, `TIPE DISKON`.
* **Klarifikasi Sales Tahun Kemarin & Bulan Kemarin**:
  * Di dalam file ekspor PQ **TIDAK ADA** kolom eksplisit bernama "Last Year Sales" atau "Last Month Sales".
  * Istilah `BOY` = *Beginning of Year* (Stok Awal Tahun), bukan penjualan tahun lalu.
  * Istilah `BOM` = *Beginning of Month* (Stok Awal Bulan), bukan penjualan bulan lalu.
  * **Solusi**: Perbandingan penjualan Day-over-Day (DoD) dan Month-over-Month (MoM) dihitung secara matematis menggunakan riwayat tabel `DailySales` di Supabase.

---

## 3. Rombakan UI/UX Laporan Penjualan Super Admin

Tampilan baru dibangun dengan estetika modern bergaya *Executive Dark & Clean SaaS*:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5 KPI CARDS EKSEKUTIF                                                      │
│ ┌───────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐ ┌─────────┐ │
│ │ 1. SPD Harian │ │ 2. WTD Week  │ │ 3. MTD Month │ │ 4. YTD  │ │ 5. EOH  │ │
│ │  + DoD Growth │ │  Omzet & Qty │ │  + Target 2M │ │  Tahunan│ │  Valuasi│ │
│ └───────────────┘ └──────────────┘ └──────────────┘ └─────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4 TAB NAVIGASI                                                              │
│ [📈 Tren POS & Kategori] [📦 Rekonsiliasi Stok] [🚨 Top & Kritis] [📋 Detail SKU]│
│                                                                             │
│ • Tab 1: AreaChart Tren Harian + PieChart Kategori + Filter Departemen      │
│ • Tab 2: Tabel Rekonsiliasi: Stok Awal (BOM) → Terjual MTD → Sisa EOH       │
│ • Tab 3: Top 10 Best Seller + Alert Stok Kritis (<=5 pcs) + Slow Moving     │
│ • Tab 4: Pencarian Cerdas 4-Cell SKU + Export PDF (PIN 220117) & Excel CSV  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Solusi Smart Search 4-Cell (Kasus Kata Kunci "nayoung")

### A. Akar Masalah
Sebelumnya, mengetik `"nayoung"` menghasilkan 0 produk karena:
1. Kolom `dept` di database terisi `'DEPARTEMEN LAINNYA'` akibat fallback lama.
2. Endpoint API `/api/product/[identifier]` hanya mencocokkan frasa ke kolom `description`, `article`, `brand`, dan `sku` (kolom `dept` terlewat).

### B. Standardisasi 4 Cell Ritel
Setiap pencarian kini otomatis mengindeks 4 kolom ritel dari PQ:
1. **`GROUP`** $\rightarrow$ `brand` (misal: `LOCAL BRAND`, `SUKO`).
2. **`DEPARTMENT`** $\rightarrow$ `dept` (misal: `NAYOUNG`, `SUKO MEN`, `SUKO LADIES`).
3. **`PARENT_NAME`** $\rightarrow$ `article` (misal: `ANTI AGING AGELESS SERUM (20 ML) SRM-NTNG1`).
4. **`ITEM_DESCRIPTION`** $\rightarrow$ `description` (misal: `ANTI AGING AGELESS SERUM:NO COLOR:20 ML`).

### C. Algoritma Pembobotan Skor
- **Exact Match Departemen**: Jika query = `"nayoung"`, produk mendapat bonus skor **+280 poin**.
- **Spaceless Match**: Mengetik `"na young"` otomatis cocok dengan `"NAYOUNG"` atau `"NA-YOUNG"` (**+120 poin**).
- **Multi-Token Match**: Mengetik `"nayoung serum"` memecah kata dan memeriksa lintas 4 cell (**+25 poin per kata cocok + 40 bonus gabungan**).
- **Physical Stock Priority**: Produk dengan stok toko aktif (`stok > 0`) diutamakan di baris teratas.

---

## 5. Ringkasan Status Deployment

* **GitHub Repository**: [`luqmanmenmen/CheckPrice`](https://github.com/luqmanmenmen/CheckPrice)
* **Branch**: `main`
* **Commit Terakhir**: `f60a734` (`feat: overhaul sales report ui, smart 4-cell retail search, and accurate pq pivot parsing`)
* **Vercel Production**: [`luqmanganteng.my.id`](https://luqmanganteng.my.id) (**LIVE**)
* **Railway Service**: `python-engine` (**LIVE & TERHUBUNG GITHUB WEBHOOK**)
* **Verifikasi Live**:
  * Tes API: `curl -L https://luqmanganteng.my.id/api/product/nayoung`
  * Hasil: Mengembalikan 23 produk Nayoung dengan departemen dan stok akurat.

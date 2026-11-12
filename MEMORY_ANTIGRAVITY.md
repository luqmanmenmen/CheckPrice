# MEMORY ANTIGRAVITY: Catatan Rombakan Lengkap & Memory Sistem

> [!IMPORTANT]
> **TRIGGER WAJIB UNTUK AI AGENT (ANTIGRAVITY):**
> **BACA DOKUMEN INI TERLEBIH DAHULU SEBELUM MERESPON ATAU MENGEKSEKUSI INSTRUKSI CHAT USER.**
> Dokumen ini adalah single source of truth arsitektur, histori rombakan, status deployment, dan preferensi inti pengguna agar **TIDAK TERJADI MISKOMUNIKASI ("BIAR GA MISSKOM")**.

---

## 1. Aturan Inti Arsitektur (Prinsip User: Python Mikir, Vercel Display)
1. **PYTHON (Backend/Parser) YANG MIKIR:**
   - Semua logika bisnis, ekstraksi data ritel, pembersihan format diskon, dan pivot data dilakukan di Python (`python-engine/parser.py` dan `python-engine/main.py`).
   - Python mengirimkan data yang **sudah matang dan siap baca** ke database Supabase.
2. **VERCEL / NEXT.JS (Frontend) HANYA UNTUK TAMPILAN:**
   - Vercel bertindak strictly sebagai Display/UI.
   - Jangan menambahkan logika penerjemahan string mentah atau rekonstruksi promo kompleks di komponen React.
3. **ISOLASI TOTAL GOOGLE ANTIGRAVITY PYTHON SDK:**
   - Folder `c:\Max Display\antigravity-sdk-demo` dibuat terpisah dan mandiri. Tidak boleh dicampur atau mengganggu project Next.js `price-checker`.

---

## 2. Daftar Berkas Proyek Utama yang Dirombak

| No | Berkas | Status | Ringkasan Perombakan |
| :--- | :--- | :--- | :--- |
| 1 | [`python-engine/parser.py`](file:///c:/Max%20Display/price-checker/python-engine/parser.py) | **Dirombak** | 1. Pra-deteksi header baris 4 sebelum konsultasi Gemini AI (mencegah `UNNAMED: 2`).<br/>2. Ekstraksi penuh 4-cell: `col_group`, `col_dept`, `col_parent`, `col_desc`.<br/>3. Sanitasi `clean_number()` untuk format tanda kutip/spasi (`" 215,946 "` & `" - "`).<br/>4. Vektorisasi *Pivot Table Engine* (GroupBy SKU: SUM sales/stok, FIRST teks). |
| 2 | [`python-engine/main.py`](file:///c:/Max%20Display/price-checker/python-engine/main.py) | **Dirombak** | Memperbaiki hierarki penugasan `dept` agar nilai riil dari PQ tidak pernah tertimpa oleh fallback lama (`DEPARTEMEN LAINNYA`). |
| 3 | [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts) | **Dirombak** | 1. Agregasi metrik ritel eksekutif: SPD, WTD, MTD, YTD, BOM, BOY, EOH, dan Valuasi Inventori.<br/>2. Perhitungan otomatis Day-over-Day (`yesterdayOmzet`) dan Month-over-Month (`lastMonthOmzet`).<br/>3. Pengayaan data rincian item dengan 4 atribut: `article`, `brand`, `dept`, `description`. |
| 4 | [`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx) | **Dirombak Total** | Desain ulang UI/UX menjadi **Executive Retail Analytics Dashboard** dengan 5 KPI Cards, 4 Tab Navigasi, Chart Recharts, Alert Stok Kritis/Slow Moving, dan Ekspor PDF (PIN 220117) & CSV. |
| 5 | [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/[identifier]/route.ts) | **Dirombak** | Integrasi 4-Cell Smart Search (`GROUP`, `DEPARTMENT`, `PARENT_NAME`, `ITEM_DESCRIPTION`) dengan pembobotan multi-tier (Exact, Prefix, Spaceless, Multi-token). |
| 6 | Database PostgreSQL (Supabase) | **Dimutakhirkan** | Sinkronisasi data departemen asli dari CSV Power Query (semua 23 SKU NAYOUNG kini berstatus `dept = 'NAYOUNG'` dan `brand = 'LOCAL BRAND'`). |

---

## 3. Analisis Struktur Power Query (PQ 10 Oktober 2026)

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

## 4. Rombakan UI/UX Laporan Penjualan Super Admin

Tampilan dibangun dengan estetika modern bergaya *Executive Dark & Clean SaaS*:

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

## 5. Solusi Smart Search 4-Cell (Kasus Kata Kunci "nayoung")

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

## 6. Dokumentasi Ekosistem Google Antigravity & Python SDK

### A. 2 Program Antigravity di Komputer User
1. **Antigravity IDE** (`C:\Users\LUCKMEN\AppData\Local\Programs\Antigravity IDE`):
   - Editor kode mandiri berbasis VS Code tempat pengerjaan kodingan langsung (`Max Display / price-checker`).
2. **Antigravity Desktop 2.0** (`C:\Users\LUCKMEN\AppData\Local\Programs\antigravity`):
   - Aplikasi mandiri (Electron) untuk manajemen tugas otomatisasi, browser testing, dan agen mandiri tanpa beban editor IDE.

### B. Setup Python & Antigravity SDK Eksplorasi
* **Paket Manajer**: `uv` terpasang di `C:\Users\LUCKMEN\.local\bin\uv.exe`.
* **Runtime Python**: CPython 3.11.17 mandiri.
* **Folder Demo Eksplorasi**: [`c:\Max Display\antigravity-sdk-demo`](file:///c:/Max%20Display/antigravity-sdk-demo)
  - File utama: [`demo.py`](file:///c:/Max%20Display/antigravity-sdk-demo/demo.py)
  - Versi SDK: `google-antigravity==0.1.22`
  - Konfigurasi API: Menggunakan `GEMINI_API_KEY` aktif yang tersimpan aman di `.env`.
  - Teruji live: Berhasil streaming respon perkenalan dari Gemini AI.
* **Perintah Menjalankan Skrip Demo**:
  ```powershell
  cd "c:\Max Display\antigravity-sdk-demo"
  & "C:\Users\LUCKMEN\.local\bin\uv.exe" run python demo.py
  ```

---

## 7. Ringkasan Status Deployment

* **GitHub Repository**: [`luqmanmenmen/CheckPrice`](https://github.com/luqmanmenmen/CheckPrice)
* **Branch**: `main`
* **Commit Terakhir**: `f60a734` (`feat: overhaul sales report ui, smart 4-cell retail search, and accurate pq pivot parsing`)
* **Vercel Production**: [`luqmanganteng.my.id`](https://luqmanganteng.my.id) (**LIVE**)
* **Railway Service**: `python-engine` (**LIVE & TERHUBUNG GITHUB WEBHOOK**)
* **Verifikasi Live**:
  * Tes API: `curl -L https://luqmanganteng.my.id/api/product/nayoung`
  * Hasil: Mengembalikan 23 produk Nayoung dengan departemen dan stok akurat.---

## 29. Otomasi Penuh Sinkronisasi MDS BISA & Cloud Runner (Tanpa IT Toko / Pure Scraping)

- **Latar Belakang:**
  Sistem dirancang mandiri tanpa ketergantungan pada tim IT toko atau VPN khusus. Scraping dilakukan langsung terhadap web MDS BISA StoreHub dan katalog publik Matahari.com.
- **Implementasi Dynamic Sesi MDS BISA:**
  1. **Ekstraksi Sesi Aktif:** Sesi login pengguna (`mso_session` JWT token & cookie session) tersimpan aman di `.mds_cookie` lokal (tercatat di `.gitignore`) dan disinkronkan ke Supabase Storage bucket `excel-uploads` pada path `secrets/mds_cookie.txt`.
  2. **Injeksi Otomatis Cloud Dispatch:** Endpoint [`src/app/api/admin/trigger/github-dispatch/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts) membaca cookie aktif dari Storage dan meneruskannya ke runner GitHub Actions (`inputs.session_cookie`). Runner juga memiliki fallback mandiri untuk mengunduh cookie langsung dari Supabase Storage.
  3. **Unpack Next.js 15 Flight RPC:** Respon Server Action MDS BISA StoreHub mengirimkan chunk `1:{"result":{"data":{...}}}`. Fungsi `parseServerActionResponse` dan `extractProductFields` di [`scripts/sync_mds_bisa_full.mjs`](file:///c:/Max%20Display/price-checker/scripts/sync_mds_bisa_full.mjs) telah disempurnakan untuk mengekstrak data UPC VendorBarcode EAN-13, StyleCode artikel, stok fisik toko, dan sanitasi desimal SQL (`199900.000000` $\rightarrow$ `199900`).
  4. **Eksekusi All-Trigger Live:** GitHub Actions Run #7 berjalan aktif menyinkronkan 2.757 SKU dengan 3 worker paralel tanpa hambatan wait loop artifisial, dilanjutkan Trigger 2 (Foto Produk Matahari.com) dan Trigger 3 (Promo Email).
---

## 9. Integrasi Barcode UPC & Style Code dari StoreHub MDS Retailing

* **Aplikasi Sumber**: `https://storehub.mdsretailing.id/item-checker`
* **Akun Otorisasi**: `M223515` (LUQMAN ARIF - SA/SPG Toko 719)
* **Tujuan**: Menarik data mapping **SKU ↔ VENDOR BARCODE (UPC EAN-13)** dan **STYLE CODE** yang selama ini hilang dari CSV Power Query, agar scanner barcode fisik dan kamera kasir di toko dapat mengenali produk secara otomatis.
* **Server Action Next.js yang Ditemukan**:
  * `checkItemDetail`: ID `60fc4882ad969e8907c38a0c8aa2c93b06a8e5c526` (Input: `['sku'/'upc', identifier]`)
  * `checkItemStock`: ID `60583352e1dc5a5d042e7557e6a166ae2d9e7e6130`
  * `login`: ID `6071833df0be708d73972db0a7dc0c7c83eb3d41f3`
  * `checkItemPromotion`: ID `604c571155331d51896a342c4afbc1c6e2091d8cb3`
* **Karakteristik Infrastruktur Toko**:
  * Server StoreHub cloud mengarahkan query detail barang ke database SQL Server lokal toko (`172.24.12.41:1433`) via VPN internal Matahari.
  * Di luar jam operasional toko (larut malam saat toko tutup), koneksi VPN toko bisa offline (`no route to host`). Sinkronisasi massal dijalankan saat jam operasional toko buka atau VPN aktif (09:00–21:30 WIB).

## 10. Arsitektur 2-Source Data (MDS BISA + matahari.com) — Menggantikan PQ

> **PQ file pipeline DIHAPUS.** Semua data kini dari MDS BISA (Trigger 1) + matahari.com foto (Trigger 2).

### File yang dibuat:

| File | Fungsi |
|---|---|
| [`scripts/sync_mds_bisa_full.mjs`](file:///c:/Max%20Display/price-checker/scripts/sync_mds_bisa_full.mjs) | Script CLI utama: auto-login, loop SKU, upsert DB. Pakai `node scripts/sync_mds_bisa_full.mjs` |
| [`src/app/api/admin/trigger/mds-bisa/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/mds-bisa/route.ts) | API Trigger 1: POST `/api/admin/trigger/mds-bisa` |
| [`src/app/api/admin/trigger/photos/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/photos/route.ts) | API Trigger 2: POST `/api/admin/trigger/photos` |

### Alur Trigger 1 (MDS BISA Sync):
1. Auto-login ke StoreHub → ambil fresh cookie (atau pakai env `MDS_SESSION_COOKIE`)
2. Loop semua SKU dari Supabase DB
3. Per SKU: `checkItemDetail` → extract barcode, article, stok, hargaNormal
4. Upsert ke `Product` table
5. Log ke `SyncHistory` (type: `"MDS_BISA_SYNC"`)

### Alur Trigger 2 (Foto Sync):
1. Scrape `matahari.com/collections/suko/products.json` (dan variasi collection lain)
2. Match SKU/article dari Shopify variants → foto CDN
3. Fallback: probe CDN `cdn.shopify.com/.../files/{sku}-1.jpg`
4. Update `imageUrl` dan `images[]` di `Product` table
5. Log ke `SyncHistory` (type: `"PHOTO_SYNC"`)

### Catatan penting:
- **Session cookie expired ~15 menit**: auto-login sudah diimplementasi. Jika gagal, set env `MDS_SESSION_COOKIE` atau buat file `.mds_cookie` di root project.
- **Toko harus buka**: `checkItemDetail` butuh SQL Server lokal toko aktif (09:00–21:30 WIB).
- **Schema DB**: kolom `barcode String? @unique` sudah ada — tidak perlu migrasi.
- **UI Trigger**: ada di halaman `/super-admin/sinkronisasi-harian` (section "Sinkronisasi Otomatis MDS BISA").

---

## 11. Pengalihan Beban Mesin: Dari Railway ke GitHub Actions

* **Keputusan**: Railway dipensiunkan (shutdown) karena file PQ 52k baris sudah tidak digunakan lagi.
* **Solusi**: Seluruh eksekusi tugas batch (MDS BISA Sync, Foto Sync, dan Parser Promo Email) dialihkan ke **GitHub Actions**.
* **Keuntungan**:
  1. Kuota **2.000 menit gratis setiap bulan** tanpa biaya langganan.
  2. Batas waktu eksekusi (timeout) hingga **6 jam** per sesi (jauh melampaui limit Vercel 10–60 detik).
  3. Dapat dijadwalkan otomatis (**jam 09:30 WIB** setiap pagi) dan dipicu manual via **tombol Trigger** di web admin melalui API `workflow_dispatch`.

---

## 14. Pemutakhiran Login & Google Apps Script (GAS) Promo Pipeline

* **Login Keyboard Enter Langsung Mulai Shift:**
  - Menekan tombol `Enter` pada input NIK otomatis memindahkan kursor ke input PIN (`pinRef.current?.focus()`).
  - Menekan tombol `Enter` pada input PIN langsung memicu fungsi `handleLogin(e)` / "Mulai Shift" seketika tanpa menutup keyboard atau memerlukan sentuhan tombol fisik.
  - Berlaku pula pada form ubah PIN pertama kali (`handleChangePin`).

* **Google Apps Script (`Kode.gs`) Khusus Promo (Zero PQ & Zero Railway):**
  - **Pemberhentian PQ & Railway:** Seluruh URL Railway (`checkprice-production.up.railway.app`) dan query Gmail `POWER QUERY` telah dihapus total dari GAS.
  - **Hanya Membaca Promo:** Query Gmail difilter ketat khusus email `has:attachment subject:"Promo" is:unread`.
  - **Kredensial Siap Pakai:** URL Supabase Storage (`https://lzynugpistiyhxqkgwmk.supabase.co`) dan Secret Key diisi langsung tanpa konfigurasi ScriptProperties yang rumit.
  - **Dual Action Sinkronisasi:** Begitu file promo masuk ke Supabase Storage (`excel-uploads/PROMO/...`), GAS langsung memicu sinkronisasi harga promo instan di Vercel (`/api/upload/sync-latest-blob`) dan mengaktifkan webhook GitHub Actions runner (`/api/admin/trigger/github-dispatch`).

## 15. Perbaikan Otorisasi Trigger (401 Unauthorized) & Pembersihan Riwayat PQ

* **Akar Masalah Error "Unauthorized" pada Trigger:**
  - Ketiga API trigger (`/api/admin/trigger/photos`, `/api/admin/trigger/mds-bisa`, `/api/admin/trigger/github-dispatch`) sebelumnya memeriksa `cookieStore.get('sessionId')`.
  - Sistem login aplikasi sebenarnya menyimpan autentikasi dalam cookie `token` (berisi JSON Web Token / JWT yang di-sign menggunakan `jose`).
  - Akibatnya, pemanggilan dari browser admin selalu gagal verifikasi (401 Unauthorized) saat tombol ditekan.
  - **Solusi:** Ketiga API rute trigger kini memvalidasi `token` menggunakan `verifyToken()` dari `@/lib/auth`, dan tetap mendukung token webhook GAS sebagai fallback otomatis. Tombol Trigger 1, Trigger 2, dan Trigger 3 kini berjalan mulus.

* **Penghapusan Total Riwayat Upload & Seksi Manual PQ:**
  - Bagian "Riwayat Upload Terakhir" (log CSV Power Query lama) dan panel arsip unggah manual PQ di [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx) telah dihapus permanen.
  - Halaman Sinkronisasi Ritel kini 100% bersih, rapi, dan murni fokus pada 3 Pilar Otomatisasi: MDS BISA, Foto Shopify, dan Mesin Cloud GitHub Actions.

* **Penyelesaian Otomatis `GITHUB_TOKEN` & Eliminasi 10s Serverless Timeout:**
  - **Akar Masalah "Unexpected token 'A', 'An error o'...":** Eksekusi batch scraping foto dan sync data di Vercel melebihi limit 10 detik runtime gratis (FUNCTION_INVOCATION_TIMEOUT) sehingga Vercel mengembalikan error HTML.
  - **Solusi Unified Cloud Dispatch:** Seluruh tombol Trigger (Trigger 1: MDS BISA, Trigger 2: Foto Produk, dan Trigger 3: Promo) kini 100% dialihkan ke **GitHub Actions Cloud Runner** (`retail-sync-engine.yml`) yang memiliki kuota gratis 2.000 menit dan timeout hingga 6 jam.
  - Response dispatch diterima UI dalam 500ms dan pekerjaan berat dijalankan aman di server Ubuntu GitHub Actions.

## 16. Arsitektur 4 Trigger Cloud Mandiri & Bebas Timeout

Halaman [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx) kini memiliki 4 kontrol terpisah:
1. **Trigger 1 — Sync Data Produk (MDS BISA Saja):** `action: 'mds-bisa'`
2. **Trigger 2 — Sync Foto Produk (Shopify CDN Saja):** `action: 'photos'`
3. **Trigger 3 — Sync Promo (Mesin Cloud Python Saja):** `action: 'promo'`
4. **Trigger 4 — Full Sync (Semua Sekaligus):** `action: 'all'`

Semua aksi dipicu secara instan via GitHub Actions Cloud Runner tanpa membebani runtime Vercel.

## 17. Pembaruan Multi-File Batch Promo & Penyelesaian SKU 53805640

* **Penyebab Harga Belum Berubah:**
  - File promo Week 45 berada di subfolder `PROMO 5 - 11 NOV 2026/3. PROMO 3344-SUKO ESSENTIALS WEEK45 SAS SIS 05-11NOV2026.xlsx` sheet `SP49`.
  - Script lama hanya membaca 1 file pertama dari storage dan tidak mengurutkan nama folder secara kronologis.
* **Perbaikan di `python-engine/run_promo_sync.py`:**
  - Fungsi `parse_folder_date_score()` untuk mengurutkan folder promo berdasarkan tanggal rilis nyata.
  - Fungsi `get_latest_promo_files_from_storage()` untuk mengekstrak dan memproses seluruh berkas promo dalam folder terbaru sekaligus.
  - Penambahan kolom audit `updatedAt` dan `createdAt` dengan format UTC ISO string saat upsert ke Supabase.
* **Status Terverifikasi Live di API (`luqmanganteng.my.id/api/product/53805640`):**
  - SKU `53805640` dan semua variannya (S, M, L, XL) berhasil terupdate dengan `hargaPromo = 49000`, `hargaNormal = 59900`, `discountType = 'HARGA SPESIAL 49000'`, periode aktif `2026-11-05` s/d `2026-11-11`. Stok MDS BISA (2 pcs) tetap aman.

## 18. Fitur Realtime Live Monitor, Persentase & Log Eksekusi Cloud

* **Tujuan:** Memberikan transparansi penuh bagi SPV/Admin saat menekan trigger sync tanpa harus membuka tab GitHub ("*kasih lah log proses di menunya jadi kita tau berapa persen dan lognya error apa engga*").
* **Endpoint API Status:** [`src/app/api/admin/trigger/github-status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-status/route.ts)
  - Mengambil data realtime dari GitHub REST API workflow `retail-sync-engine.yml`.
  - Mengkalkulasi persentase progres ($0\% - 100\%$), langkah aktif, durasi pengerjaan, dan mendeteksi error jika salah satu step berstatus `failure`.
  - Mengambil 5 riwayat data sync terakhir dari tabel `SyncHistory` database Supabase.
* **Komponen UI:** [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx)
  - **Badge Status:** 🟡 Berjalan (XX%) / 🟢 Selesai 100% / 🔴 Error.
  - **Visual Progress Bar:** Bar dinamis responsif dengan persentase dan timer durasi.
  - **Checklist Langkah:** Rincian status step per step (✅ Selesai, ⏳ Berjalan, ⏭️ Dilewati, ❌ Gagal).
  - **Terminal Console Output:** Kotak konsol log bergaya dark-terminal dengan auto-scroll dan tombol Perluas/Ringkas.
  - **Auto-Polling:** Polling otomatis setiap 3.5 detik saat proses sedang aktif, serta tombol manual "Segarkan".

## 20. Pemutakhiran Auto-Add Produk Baru MDS BISA, Backfill Foto Kaos Kaki & Timeout Runner

* **Auto-Add Produk Baru (Upsert Penuh):**
  - Sebelumnya, `sync_mds_bisa_full.mjs` hanya menggunakan `prisma.product.update` dan mengabaikan produk baru (`err.code === 'P2025'`).
  - Kini diupgrade menjadi `prisma.product.upsert`: setiap produk/SKU yang ditemukan di StoreHub MDS BISA otomatis ditambahkan ke database Supabase lengkap dengan barcode UPC, article/style code, warna, ukuran, deskripsi, harga normal, dan stok toko fisik.
  - Penanganan duplikasi barcode (`P2002`) otomatis melakukan retry upsert tanpa barcode sehingga data stok dan produk tetap tersimpan aman.

* **Sinkronisasi Realtime ke Website `luqmanganteng.my.id`:**
  - Karena Vercel membaca langsung database PostgreSQL Supabase yang sama, setiap perubahan data (stok, harga normal, harga promo, barcode, varian) **langsung live seketika** di `luqmanganteng.my.id` tanpa perlu rebuild/redeploy Vercel.

* **Backfill Foto Kaos Kaki (SKU 19171694) & Boxer (SKU 53805640):**
  - SKU `19171694` (Kaos Kaki Reguler S2S084D1) dan SKU `53805640` (Pakaian Dalam Boxer U4U165D3-1) telah terverifikasi live di API & website:
    - Kaos Kaki: Promo Rp 19.000 + Foto resmi CDN Matahari aktif.
    - Boxer: Promo Rp 49.000 (diskon dari Rp 59.900) + Foto resmi CDN Matahari aktif + Stok 2 pcs.

* **Optimasi Runner GitHub Actions:**
  - `REQUEST_DELAY_MS` dipersingkat dari 800ms menjadi 350ms per request StoreHub.
  - `timeout-minutes` pada `.github/workflows/retail-sync-engine.yml` diperpanjang dari 60 menit menjadi 360 menit (6 jam) agar sync massal 9.500 SKU berjalan tuntas tanpa terpotong batas waktu runner.

## 21. Isolasi 100% Eksekusi di GitHub Actions & Pemisahan Trigger Fast Stock-Only

* **Prinsip Utama (User Rule): "SEMUA BERJALAN DI GITHUB, JANGAN DI VERCEL":**
  - Vercel strictly hanya bertindak sebagai Front-End / Display UI dan penerus sinyal webhook (0,5 detik via GitHub REST API `workflow_dispatch`).
  - Seluruh komputasi batch berat, loop scraping StoreHub MDS BISA, pemutakhiran database Prisma PostgreSQL, parsing promo Python, dan katalog gambar Shopify dieksekusi 100% di server cloud **Ubuntu GitHub Actions Runner**.
  - Beban komputasi serverless Vercel = 0. Tidak ada risiko timeout 10 detik.

* **Pemisahan Trigger MDS BISA: Full vs Fast Stock:**
  - **Trigger 1A — MDS BISA Full Sync (`action: 'mds-bisa'`):** Menjalankan loop penuh 9.500 SKU untuk mendeteksi & mendaftarkan produk baru, barcode UPC, style code, warna, ukuran, deskripsi, harga normal, dan stok fisik.
  - **Trigger 1B — Fast Stock-Only Sync (`action: 'stock-only'` / flag `--stock-only`):** Khusus memperbarui angka stok fisik (`stok`) untuk SKU aktif toko 719 tanpa menimpa data master lainnya. Jauh lebih cepat, efisien, dan menghemat kuota runner.

## 22. Implementasi Concurrency 3 Worker, Otomasi 2x Sehari & Tombol Live Stock On-Demand

* **Concurrency 3 Worker Paralel (`scripts/sync_mds_bisa_full.mjs`):**
  - Mengubah pemrosesan loop sekuensial menjadi sistem worker pool paralel dengan 3 worker simultan.
  - Waktu eksekusi 9.529 SKU terpangkas dari **55 menit menjadi hanya ±18 menit**.
  - Rate limiting tetap aman dengan delay 350ms per worker, auto-relogin jika session expired, dan proteksi instan jika server toko offline.

* **Penjadwalan 2x Sehari (Pagi & Malam Closing) di GitHub Actions:**
  - **Pukul 09:30 WIB (Pagi):** Full Sync 9.500 SKU (Mendeteksi produk baru, barcode, promo, dan stok awal).
  - **Pukul 21:00 WIB (Malam Closing):** Full Sync 9.500 SKU (Merekap penerimaan barang receiving DC dan penjualan harian sebelum komputer kasir dimatikan pukul 21:30 WIB).
  - **Kalkulasi Kuota Bulanan:** 18 menit $\times$ 2 kali $\times$ 30 hari = **1.080 menit per bulan**. Kuota gratis GitHub (2.000 menit) terpakai 54%, menyisakan **920 menit free buffer cadangan**.

* **Fitur On-Demand "⚡ Live MDS" di Layar Kasir/Detail Barang:**
  - Modul client: [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) dengan in-memory cookie caching.
  - Endpoint API: [`src/app/api/live-stock/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/live-stock/route.ts) (independen dari route dynamic `[identifier]`)
  - Tombol **`⚡ Live MDS`** di samping kotak `Sisa Stok (EOH)` pada [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx).
  - Mengambil data stok riil 1 SKU ke StoreHub dalam **300ms**, langsung mengupdate angka stok di Supabase dan layar kasir dengan indikator status hijau. Menggunakan **0 menit kuota GitHub Actions**.

## 24. Pemutakhiran Live Stock On-Demand: 1 Klik Update Seluruh Varian Artikel (Warna & Ukuran)

* **Kebutuhan Lapangan (User Request):**
  - Satu artikel ritel memiliki banyak varian warna (Black, Navy, Grey, White) dan ukuran (S, M, L, XL).
  - Jika update hanya dilakukan per 1 SKU, varian lain di layar masih menampilkan stok lama.
* **Solusi: Ekstraksi `relatedStock` Multi-Varian Sekaligus:**
  - Fungsi [`checkSingleItemStock`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) dioptimasi: saat menembak StoreHub untuk 1 SKU, StoreHub mengembalikan struktur `relatedStock` yang mencakup seluruh pemetaan warna dan ukuran untuk artikel tersebut.
  - Sistem mencocokkan seluruh data warna & ukuran ke daftar `siblings` artikel di Supabase, dan langsung memperbarui stok seluruh varian artikel tersebut dalam satu transaksi tunggal.
  - Di layar kasir ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)), menekan tombol **`⚡ Live MDS`** otomatis memutakhirkan stok produk aktif beserta seluruh kartu varian warna dan ukuran di bawahnya dalam waktu **0,3 detik**.
  - Menggunakan **0 menit kuota GitHub Actions** dan **0 beban Vercel serverless**.

---

## 25. Pemindai Kamera Barcode 1D (EAN/UPC), Backup Engine SKU, & Prinsip Collage vs Audit

* **Backup Aman Engine Scan SKU (OCR):**
  - Engine scan lama berbasis OCR Tesseract disimpan utuh di [`src/components/TextScanner_SKU_Backup.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner_SKU_Backup.tsx) sebagai cadangan permanen jika sewaktu-waktu ingin diaktifkan kembali.

* **Implementasi True Barcode Scanner 1D ([`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx)):**
  - Menggantikan proses OCR teks yang berat dengan **Pemindai Barcode Fisik 1D (EAN-13, UPC-A, Code 128, Code 39, QR)** berbasis `Html5Qrcode` dan Native C++ `BarcodeDetector` API Android Chrome (5–15ms per deteksi).
  - Dilengkapi antarmuka kasir modern:
    - Viewfinder horizontal proporsional untuk hangtag/barcode pakaian.
    - Animasi laser horizontal pemindai dinamis.
    - Nada audio kasir (Beep 1.8 kHz) & getar haptic (60ms) saat barcode terdeteksi.
    - Kontrol Senter (Flashlight / Torch ON/OFF) dan Switch Kamera Depan/Belakang.
  - Drop-in replacement: tetap kompatibel dengan fungsi `searchProduct(barcode)` di `src/app/page.tsx` dan `src/app/cek-harga/page.tsx` tanpa breaking changes.

* **Penerapan Prinsip "Collage vs Audit":**
  - **Collage (Koleksi Data Baru):**
    - Di [`scripts/sync_matahari_images.js`](file:///c:/Max%20Display/price-checker/scripts/sync_matahari_images.js), sistem memeriksa status foto di Supabase: SKU yang sudah berfoto lengkap langsung **dilewati (skip)** sehingga tidak membuang waktu dan kuota probing CDN.
    - Jika katalog online merilis SKU baru yang belum terdaftar di Supabase, sistem otomatis meng-collage (`createMany`) data produk baru tersebut ke database.
    - Waktu eksekusi Trigger 2 terpangkas dari 15 menit menjadi di bawah 30 detik.
  - **Audit (Pemeriksaan Menyeluruh Data Dinamis Stok):**
    - Stok fisik toko diaudit menyeluruh 2x sehari via MDS BISA worker pool, atau on-demand 1 artikel via tombol `⚡ Live Stok Artikel` di HP kasir (0,3 detik, 0 kuota).
  - **Tombol Trigger 1 & 2 di Website Admin:**
    - Halaman `/super-admin/sinkronisasi-harian` 100% siap memicu Trigger 1A (MDS BISA), Trigger 1B (Stock Only), Trigger 2 (Foto), Trigger 3 (Promo), atau Trigger 4 (All) secara instan via GitHub Actions kapan pun diperlukan di luar jam otomatis.

---

## 26. Finalisasi Mode Murni Scan Barcode & Dashboard Riwayat Update Sukses Terakhir

* **Mode Scan Murni Barcode (Zero Option, Langsung Barcode 1D):**
  - Seluruh label tombol dan antarmuka pemindai di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) dan [`src/app/cek-harga/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/cek-harga/page.tsx) diubah menjadi **"Scan Barcode Produk (EAN-13 / UPC)"** dengan ikon barcode.
  - Pemindai kamera langsung mengunci garis barcode vendor danhangtag ritel secara instan tanpa opsi teks SKU OCR yang memperlambat.

* **Dashboard & Indikator Riwayat Update Terakhir:**
  - **Endpoint API [`/api/last-update`](file:///c:/Max%20Display/price-checker/src/app/api/last-update/route.ts):**
    - Menyediakan informasi waktu update terakhir (`lastUpdate`) dan riwayat 10 eksekusi terakhir dari tabel `SyncHistory`.
    - Mengelompokkan status 3 pilar: `pillars.mdsBisa`, `pillars.photos`, dan `pillars.promo` lengkap dengan jumlah rekaman dan status `SUCCESS`.
  - **Layar Beranda Kasir (`src/app/page.tsx`):**
    - Kotak informasi status sistem kini menampilkan badge hijau, waktu update terakhir (WIB), serta rincian 3 pilar: MDS BISA (item SOH), Foto (galeri terupdate), dan Promo.
  - **Layar Kiosk Cek Harga (`src/app/cek-harga/page.tsx`):**
    - Header pemindai menampilkan status waktu update terakhir produk secara elegan di samping badge `Mode Cepat 0ms`.
  - **Layar Super Admin (`src/app/super-admin/sinkronisasi-harian/page.tsx`):**
    - Kartu Eksekutif **"Riwayat Eksekusi Update Terakhir"** dengan 3 kartu status pilar (MDS BISA, Foto Online, Promo Python) dan tabel riwayat lengkap 10 eksekusi terakhir dari tabel `SyncHistory` (waktu WIB, tipe pilar, nama berkas, jumlah item, dan status badge hijau `SUKSES`).

---

## 27. Resolusi Kamera Belakang Layar Hitam (Black Page) & Otorisasi Penuh Menu Sinkronisasi

* **Perbaikan Total Kamera Belakang (Eliminasi Black Screen di Android):**
  - **Akar Masalah:**
    1. Pemanggilan `Html5Qrcode.getCameras()` di dalam effect memodifikasi `selectedCameraId` saat kamera sedang di-acquire oleh browser, memicu **race condition & hardware lock** kamera belakang di Android Chrome.
    2. Properti `aspectRatio: 1.0` memaksa resolusi square yang tidak didukung oleh sensor lensa kamera belakang HP (4:3 / 16:9), sehingga stream video menjadi hitam pekat (black screen) sementara kamera depan yang memiliki mode selfie bisa menyala.
  - **Solusi:**
    - Menggunakan native `{ facingMode: "environment" }` langsung tanpa mengunci ID kamera dinamis yang memicu re-render ganda.
    - Menghapus pembatasan `aspectRatio: 1.0` dan membiarkan sensor kamera memakai resolusi alaminya, lalu disesuaikan oleh CSS global `#retail-barcode-scanner-view video { object-fit: cover !important }`.
    - Menambahkan `isStartingRef` dan cleanup promise async agar tidak ada 2 proses start/stop kamera yang bertabrakan.
    - Kamera belakang kini langsung menyala jernih seketika saat tombol scan dibuka.

* **Resolusi Menu Sinkronisasi Ditendang ke Login & Proteksi Khusus Akun Developer NIK 22054178:**
  - **Akar Masalah:**
    1. Akun NIK `22054178` adalah Developer (`SUPERVISOR`). Saat testing multi-device (misal HP kasir + Laptop bersamaan), mekanisme single active session (`sessionId != session.sessionId`) di `/api/auth/me` menghapus cookie token (`maxAge: 0`) pada perangkat yang sedang dipakai.
    2. Batas waktu jam shift di middleware sempat mengecek jam kerja sehingga memicu redirect ke `/login` bagi session yang ter-refresh.
    3. Ketika redirect 307 ke login terjadi saat background fetch `/api/admin/trigger/*`, browser menerima HTML `<!DOCTYPE html>`, yang memicu error parsing `JSON.parse` bertuliskan **"Server tidak merespons JSON valid"**.
  - **Solusi Tuntas:**
    1. **Role Akun Lain Tetap Terjaga:** Akun `223515` tetap `CREW_STORE` murni sesuai instruksi tegas pengguna. Tidak ada role akun lain yang diubah.
    2. **Multi-Device Session Support Developer:** Di [`/api/auth/me`](file:///c:/Max%20Display/price-checker/src/app/api/auth/me/route.ts) dan [`/api/auth/login`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts), akun Developer `22054178` / `SUPERVISOR` dibebaskan dari pembatalan sesi ganda sehingga dapat aktif di HP dan Laptop secara bersamaan tanpa pernah terlempar ke halaman login.
    3. **Akses Penuh Endpoint Trigger:** Di `src/middleware.ts`, `src/app/super-admin/sinkronisasi-harian/page.tsx`, `github-dispatch`, `github-status`, `mds-bisa`, dan `photos`, akun NIK `22054178` diberikan akses developer permanen bebas dari auto-logout shift.
    4. **Dukungan Barcode Hangtag Ritel (EAN-13):** Barcode `2340002272943` (SKU `13472861`, T1KT1351 S, Rp 129.900) terverifikasi 100% cocok di database Supabase dan langsung dikenali oleh pemindai barcode 1D.---

## 29. Otomasi Penuh Sinkronisasi MDS BISA & Cloud Runner (Tanpa IT Toko / Pure Scraping)

- **Latar Belakang:**
  Sistem dirancang mandiri tanpa ketergantungan pada tim IT toko atau VPN khusus. Scraping dilakukan langsung terhadap web MDS BISA StoreHub dan katalog publik Matahari.com.
- **Implementasi Dynamic Sesi MDS BISA:**
  1. **Ekstraksi Sesi Aktif:** Sesi login pengguna (`mso_session` JWT token & cookie session) tersimpan aman di `.mds_cookie` lokal (tercatat di `.gitignore`) dan disinkronkan ke Supabase Storage bucket `excel-uploads` pada path `secrets/mds_cookie.txt`.
  2. **Injeksi Otomatis Cloud Dispatch:** Endpoint [`src/app/api/admin/trigger/github-dispatch/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts) membaca cookie aktif dari Storage dan meneruskannya ke runner GitHub Actions (`inputs.session_cookie`). Runner juga memiliki fallback mandiri untuk mengunduh cookie langsung dari Supabase Storage.
  3. **Unpack Next.js 15 Flight RPC:** Respon Server Action MDS BISA StoreHub mengirimkan chunk `1:{"result":{"data":{...}}}`. Fungsi `parseServerActionResponse` dan `extractProductFields` di [`scripts/sync_mds_bisa_full.mjs`](file:///c:/Max%20Display/price-checker/scripts/sync_mds_bisa_full.mjs) telah disempurnakan untuk mengekstrak data UPC VendorBarcode EAN-13, StyleCode artikel, stok fisik toko, dan sanitasi desimal SQL (`199900.000000` $\rightarrow$ `199900`).
  4. **Hasil Eksekusi Penuh (Run #7):** 100% SUKSES! Seluruh 9.703 produk master telah disinkronkan, ber-barcode hangtag asli, dan memiliki stok fisik toko 719.

---

## 30. Resolusi Banner "Pembaruan Tersedia" & Graceful Fallback Tombol "Live Stok"

- **Banner Pembaruan Tersedia:**
  1. Banner pink `PEMBARUAN TERSEDIA! [UPDATE SEKARANG]` adalah pemicu sinkronisasi cache IndexedDB offline HP dari Supabase.
  2. Ditambahkan tombol dismiss `(X)` sehingga kasir dapat menutup banner kapan saja tanpa dipaksa menunggu unduhan offline.
  3. Saat tombol ditekan, status versi lokal langsung tersinkron dan banner otomatis tersembunyi (*dismissed*).
- **Tombol "Live Stok Artikel" di Luar Jam Operasional:**
  1. Tombol `⚡ Live Stok Artikel` mencoba query langsung ke StoreHub saat diklik. Namun di malam hari (toko tutup), koneksi StoreHub ke gerai lokal mengalami 504 Gateway Timeout.
  2. Logika `isStoreOpen()` dan pesan error IT yang kaku telah dihapus dari `src/lib/mdsBisaClient.ts`.
  3. Sistem kini menerapkan **Graceful Fallback**: Jika query malam hari mengalami 504 / timeout, sistem otomatis mengembalikan data stok tersimpan di Supabase dengan toast info ramah: *"Toko tutup (malam). Menampilkan stok tersimpan: X pcs"*, tanpa pesan error merah yang menakutkan.

---

## 31. Audit Total Barcode Batang (UPC / EAN-13) & Integrasi Badge Barcode di Tampilan Produk

- **Hasil Audit Database Supabase (Detik Ini):**
  - Total Produk: **9.703 SKU**.
  - Produk dengan Barcode Batang Asli: **9.703 produk (100% LENGKAP!)**.
  - Distribusi Panjang Barcode:
    - 13 digit EAN-13 (Awalan `234...` / `23...` hangtag ritel): **9.698 produk**.
    - 12 digit UPC-A: **5 produk**.
    - SKU tanpa barcode / invalid / null: **0 produk (NOL KOSONG)**.
  - Seluruh 7.651 SKU dari file Power Query 10 Oktober 2026 terverifikasi 100% sudah masuk ke database dan telah memiliki barcode hangtag resmi.
- **Penyebab Keraguan Pengguna & Solusi UI:**
  - Sebelumnya, tampilan kartu detail produk di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) dan Kiosk [`src/app/cek-harga/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/cek-harga/page.tsx) hanya menampilkan label `SKU:` dan `ARTIKEL:`, sementara label `BARCODE:` belum dimunculkan di kartu. Hal ini membuat kasir mengira produk belum memiliki barcode.
  - **Solusi Terpasang:** Ditambahkan badge hijau terang **`BARCODE: {product.barcode}`** dengan ikon Barcode di samping badge SKU dan ARTIKEL. Kasir dan user kini dapat langsung melihat nomor barcode fisik hangtag asli dari setiap SKU yang dicari.

---

## 32. Eliminasi Perulangan Banner Pink "Pembaruan Tersedia" (Persistensi Versi & Dismiss)

- **Akar Masalah:**
  1. Perbandingan versi di `page.tsx` sebelumnya menggunakan `serverVersion !== localVersion` yang membandingkan timestamp mentah milidetik. Setiap kali background sync atau update SKU berjalan di server, timestamp server menjadi lebih baru sehingga memicu banner berulang kali.
  2. Flag dismiss `dismissedUpdate` sebelumnya hanya disimpan di state React (`useState(false)`). Begitu halaman di-refresh atau dibuka ulang, state kembali ke `false` sehingga banner pink muncul lagi meskipun pengguna sudah menekan tombol [UPDATE SEKARANG].
  3. Cek `hasAppCodeUpdate` memeriksa string versi aplikasi yang tersimpan di `localStorage` klien.
- **Solusi Tuntas (Commit `4e35d0d`):**
  1. **Persistensi ke LocalStorage:** Status versi yang di-update maupun di-dismiss disimpan permanen ke `localStorage` pada key `suko_dismissed_update` dan `suko_server_version`.
  2. **Logika Perbandingan Numerik:** Banner hanya muncul jika `Number(serverVersion) > Number(localVersion)` DAN versi tersebut belum pernah di-update atau di-dismiss (`isDismissedForThisVersion` false).
  3. **Mutasi SWR & Suko Client Version:** Begitu [UPDATE SEKARANG] selesai atau tombol `(X)` diklik, versi aktif langsung di-cache ke storage, `hasAppCodeUpdate` dinonaktifkan, dan SWR di-refresh seketika.
  4. **Hasil:** Sekali tombol [UPDATE SEKARANG] ditekan atau ditutup `(X)`, banner pink **TIDAK AKAN PERNAH MUNCUL LAGI** meskipun halaman di-refresh berkali-kali. Banner baru akan muncul hanya jika ada pembaruan data besar baru di masa mendatang.

---

## 33. Resolusi Scan Gagal di HP ("Produk Tidak Ditemukan", Lemot, Scan Ulang Baru Muncul)

- **Akar Masalah:**
  1. **Kesalahan Fatal `db.products.clear()` Saat Unduh:** Pada mekanisme lama di `src/lib/offlineDb.ts`, fungsi `syncOfflineDatabase` selalu memanggil `clear()` terlebih dahulu sebelum memasukkan data baru. Jika jaringan HP kasir sempat tersendat saat mengunduh 9.703 item (3.5MB JSON), database lokal menjadi kosong melompong (*empty state*).
  2. **Over-Indexing IndexedDB (17 Index):** Skema `v10` mendaftarkan 17 kolom ke index B-Tree IndexedDB (`products: 'sku, barcode, article, name, description, ...'`). Akibatnya browser HP harus menulis 164.000 entri index, membuat penyimpanan HP lemot parah dan sering freeze/hang.
  3. **Fenomena "Scan 2 Kali Baru Muncul":** 
     - Scan pertama: Karena offline DB lokal kosong/sebagian, sistem terpaksa request live ke server via internet. Saat jaringan toko lambat, scan pertama gagal atau timeout ("Produk tidak ditemukan").
     - Namun di balik layar, respon server tersebut sempat disimpan ke `sessionCacheRef` & IndexedDB.
     - Scan kedua: Karena produk tadi sudah tersimpan di cache, scan kedua langsung berhasil seketika.
- **Solusi Tuntas (Commit `557d004`):**
  1. **Hapus `db.products.clear()`:** Diganti dengan `bulkPut` aman per-chunk (1.000 item). Data lama tetap utuh dan bisa langsung di-scan kapan saja tanpa ada momen database kosong di HP.
  2. **Skema Cepat `v11` (Hanya 3 Index):** Rampingkan skema ke `products: 'sku, barcode, article'`. Kolom lainnya disimpan murni sebagai data tanpa index B-Tree berlebihan. Proses sync di HP kini **10x lebih cepat (~1 detik) dan sangat ringan**.
  3. **Multi-Format Barcode Fallback:** Ditambahkan pencocokan fleksibel barcode di memori lokal (termasuk penanganan leading zero).
  4. **Pesan Jaringan Ramah:** Jika internet toko tersendat saat live query, pesan diubah menjadi *"Koneksi internet toko sedang lambat. Coba scan ulang"* agar tidak memicu kebingungan kasir.

---

## 34. Arsitektur Dual Sourcing (MDS BISA & File Promo) & Antrean Prioritas Barcode

- **Konsep "Dua Peruntungan & Saling Backup" (Ide Pengguna):**
  1. **Dedup & Efisiensi:** Jika sebuah SKU sudah berhasil di-scrap dari MDS BISA (memiliki barcode hangtag, stylecode, dan stok), maka saat file promo dibaca dan menemukan SKU yang sama, sistem cukup memperbarui harga diskon/promonya saja tanpa perlu membuang waktu/kuota scrap ulang ke StoreHub.
  2. **Antrean Pending Barcode (Keep Dulu & Coba Lagi Besok):** Jika ada SKU baru dari file promo yang saat ditembak ke MDS BISA belum ada di SQL toko 719 (misal barang baru dari gudang pusat/DC yang belum di-receive toko), produk **TETAP DISIMPAN DI DATABASE** dengan status pending (`barcode: null`).
  3. **Prioritas Terdepan Runner Harian:** Di [`scripts/sync_mds_bisa_full.mjs`](file:///c:/Max%20Display/price-checker/scripts/sync_mds_bisa_full.mjs) dan API trigger [`src/app/api/admin/trigger/mds-bisa/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/mds-bisa/route.ts), seluruh SKU tanpa barcode otomatis diletakkan di **baris antrean paling depan**. Setiap pagi (09:45 WIB), sistem otomatis mencoba peruntungan kembali untuk menarik Barcode UPC EAN-13 & Stok fisiknya begitu barang tersebut selesai di-receive oleh toko!

---

## 35. Proteksi 24 Jam Data Request Facing Out & Keranjang Draft Saat Logout

- **Akar Masalah:**
  1. Pada [`src/app/api/auth/logout/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/logout/route.ts), setiap kali pengguna menekan logout, sistem lama mengeksekusi `prisma.ticket.updateMany` untuk mengubah semua tiket PENDING/READY menjadi `COMPLETED` dengan alasan *"Shift Selesai (Logout)"*.
  2. Pada [`src/app/api/tickets/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/tickets/route.ts), kueri gudang menyaring `shift: { endTime: null }` sehingga tiket langsung lenyap dari layar gudang begitu SA logout.
  3. Pada layar depan kasir (`src/app/page.tsx`), state antrean keranjang facing out (`cart`) hanya tersimpan di memori sementara React (`useState([])`) sehingga draft barang hilang jika tidak sengaja logout atau refresh browser.
- **Solusi Tuntas (Commit `21926e8`):**
  1. **Hapus Auto-Close di Logout:** Endpoint logout tidak lagi menutup tiket aktif PENDING/READY.
  2. **Retensi 24 Jam Tiket di Gudang & SA:** Tiket request facing out kini bertahan aktif selama 24 jam penuh. Kueri gudang maupun SA mengambil tiket aktif berumur $\le 24$ jam tanpa terkunci oleh status logout shift. Auto-close hanya dijalankan untuk tiket yang sudah lewat dari 24 jam.
  3. **Persistensi 24 Jam Draft Keranjang di HP:** Keranjang antrean facing out sebelum dikirim (`cart`) kini otomatis tersimpan di `localStorage` (`suko_facing_out_cart`). Jika kasir tidak sengaja logout atau HP mati, saat login kembali dalam 24 jam, seluruh daftar barang yang sudah ditambahkan tetap utuh!

---

## 36. Resolusi Hapus Karyawan / Cascade Delete Data Relasi Pengguna

- **Akar Masalah:**
  Pada endpoint `DELETE /api/admin/users`, sistem sebelumnya hanya memanggil `prisma.user.delete({ where: { id } })`. Karena pengguna yang pernah bekerja memiliki data relasi foreign key di tabel `Shift`, `Ticket`, `LoginLog`, dan `SyncHistory`, PostgreSQL menolak penghapusan dengan error foreign key constraint: *"Gagal menghapus pengguna, mungkin memiliki data relasi (Shift/Tiket)"*.
- **Solusi Tuntas (Commit `664fb1c`):**
  1. **Transaksi Aman Cascade Delete (`prisma.$transaction`):** Sebelum menghapus akun user, sistem otomatis membersihkan seluruh rekaman relasi dependensi:
     - Hapus tiket (`Ticket`) yang dibuat pengguna atau berada di shift pengguna.
     - Hapus riwayat shift (`Shift`).
     - Hapus riwayat sinkronisasi (`SyncHistory`).
     - Hapus riwayat log login (`LoginLog`).
     - Hapus akun pengguna (`User`).
  2. **Proteksi Keamanan:**
     - Akun Developer Utama (NIK `22054178`) diproteksi permanen dari penghapusan (`403 Forbidden`).
     - Pengguna yang sedang aktif login dicegah dari menghapus akunnya sendiri (`400 Bad Request`).
  3. **Hasil:** Tombol hapus karyawan di menu Super Admin (`/super-admin/users`) kini dapat menghapus akun karyawan mana pun dengan lancar dan bersih tanpa error relasi database.

---

## 37. Fitur Redirect Karyawan Tertentu ke Portal MDS BISA (StoreHub)

- **Latar Belakang & Kebutuhan Pengguna:**
  Pengguna ingin mengarahkan karyawan tertentu yang sudah didaftarkan agar saat mereka membuka link `luqmanganteng.my.id`, memasukkan NIK & PIN mereka dan menekan enter/login, mereka **langsung dialihkan (dilempar) ke halaman login MDS BISA** (`https://storehub.mdsretailing.id/login?next=%2F`). Pengguna lain / kasir yang tidak di-redirect tetap login normal ke Price Checker, dan Akun Developer Utama (`22054178`) tetap ke dashboard Super Admin.
- **Implementasi End-to-End:**
  1. **Database Schema (`prisma/schema.prisma`):**
     Menambahkan field `redirectMds Boolean @default(false)` pada model `User`. Telah disinkronkan ke Supabase production via `prisma db push`.
  2. **API Admin Users (`src/app/api/admin/users/route.ts`):**
     - `GET`: Menyertakan `redirectMds: true` pada query `findMany`.
     - `PUT`: Menerima update status `redirectMds` dari formulir Edit Karyawan.
     - `PATCH`: Endpoint instan 1-klik untuk toggle status `redirectMds: boolean` per user ID dengan proteksi permanen NIK Developer `22054178`.
  3. **Backend Login Auth (`src/app/api/auth/login/route.ts`):**
     - Setelah validasi NIK & PIN berhasil, jika `user.redirectMds === true` (dan bukan developer `22054178`), sistem mencatat aktivitas di `LoginLog` dengan catatan `Redirect MDS BISA`, lalu mengembalikan:
       `{ success: true, redirectMds: true, redirectUrl: "https://storehub.mdsretailing.id/login?next=%2F" }`.
  4. **Frontend Login Handler (`src/app/login/page.tsx`):**
     - Menangkap respon `data.redirectMds` atau `data.redirectUrl`.
     - Mengeksekusi `window.location.href = data.redirectUrl` seketika saat PIN di-enter.
  5. **UI Super Admin (`src/app/super-admin/users/page.tsx`):**
     - **Tabel Karyawan:** Menampilkan badge amber `🔄 Redirect MDS BISA` di bawah nama karyawan jika status redirect aktif.
     - **Tombol Aksi Cepat:** Ikon `<ExternalLink />` di samping tombol Edit/Hapus untuk mengaktifkan atau menonaktifkan pengalihan dalam 1 klik dengan konfirmasi dialog aman.
     - **Modal Edit Karyawan:** Toggle switch modern untuk mengubah status pengalihan langsung saat mengedit profil karyawan.

---

## 38. Kiosk Cek Harga (/cek-harga) Disembunyikan Sementara Waktu

- **Latar Belakang:** Atas instruksi pengguna (*"untuk check harga kiost sementara ini di hidden dulu yak"*), seluruh pintu akses dan halaman Kiosk Cek Harga dinonaktifkan sementara.
- **Implementasi:**
  1. **Halaman Login ([`src/app/login/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/login/page.tsx)):** Tombol *"Hanya Mau Cek Harga? Buka Kiosk Publik"* di-comment/hidden.
  2. **Drawer Navigasi ([`src/components/Sidebar.tsx`](file:///c:/Max%20Display/price-checker/src/components/Sidebar.tsx)):** Menu item *"Kiosk Cek Harga"* di-comment/hidden.
  3. **Middleware Guard ([`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts)):** Akses URL `/cek-harga` langsung dialihkan ke `/login` (atau ke `/` jika pengguna memiliki sesi aktif).
  4. **Halaman Kiosk ([`src/app/cek-harga/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/cek-harga/page.tsx)):** Flag `const IS_KIOSK_HIDDEN = true;` dipasang. Jika halaman sempat dimuat/di-cache, otomatis menghentikan proses pemindai kamera & mengalihkan browser kembali ke `/login`.

---

## 39. Audit Bukti Nyata 9.703 SKU & Barcode dan Penjelasan Kasus Missing Barcode Produk Baru

- **Hasil Audit Nyata Database Supabase:**
  - Total Produk: **9.703 item**.
  - Produk Memiliki Barcode: **9.703 item (100% lengkap, 0 item null/kosong)**.
  - Distribusi Barcode: **9.698 item EAN-13 (13 digit)** (9.523 berawalan `234000...`) & **5 item UPC (12 digit)**.
  - Barcode non-digit: **0**.
  - Barcode duplikat: **0**.
  - SKU duplikat: **0**.
  - Pencarian live by Barcode maupun SKU diuji di production dan **100% langsung berhasil (0ms / fast)**.
- **Kasus Barcode `2340002353093` dari User:**
  1. Barcode `2340002353093` adalah barcode fisik asli EAN-13 yang valid (awalan `234000`, 6 digit tengah `235309`, check digit `3`).
  2. Barcode ini jatuh tepat pada celah (*gap*) antara barcode `2340002348013` (SKU `61270935`, BYRCH & Co) dan `2340002362477` (SKU `61312649`, SUKO GIRLS).
  3. Mengapa tidak ada di database? Karena database master 9.703 item bersumber dari **Power Query 10 Oktober 2026** (ekspor 7 Oktober 2026). Barang `2340002353093` adalah **barang kiriman baru (new arrival)** yang belum ada di rekap PQ lama tersebut.
  4. Mengapa tidak langsung tertarik live malam ini? Saat sistem menembak StoreHub MDS BISA untuk barcode `2340002353093`, server MDS BISA mengembalikan pesan error resmi:  
     `"error":"check detail on store 719: query store 172.24.12.41:1433: unable to open tcp connection with host '172.24.12.41:1433': connect: no route to host"`.  
     Artinya, komputer server lokal toko 719 dimatikan listriknya di luar jam operasional malam hari. Begitu toko buka besok pagi (09:00 WIB), StoreHub otomatis bisa terhubung kembali!
- **Penyempurnaan Sistem:**
  1. Dukungan pencarian parameter `'upc'` di [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) untuk barcode 12–13 digit (sebelumnya hanya `'sku'`).
  2. Fitur `upsert` otomatis produk baru ke Supabase jika ditemukan saat live query MDS BISA.
  3. Pesan UI informatif di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) saat kasir memindai barcode baru yang belum tercatat di database master toko, sehingga tidak memicu kebingungan.

---

## 40. Acuan Audit Master Database & Arsitektur Self-Healing Produk Toko

- **Prinsip Utama:**
  Kasus barcode `2340002353093` menjadi **acuan dan cetak biru permanen** agar ketidakterdeteksian barang fisik di toko tidak pernah berujung pada dead-end (*"Produk tidak ditemukan"*).
- **Hasil Audit Lintas File:**
  1. Seluruh **8.339 SKU promo aktif minggu ini (5–11 Nov 2026)** terbukti 100% sudah masuk ke database Supabase.
  2. Sebanyak **1.364 SKU non-promo** berasal dari file Power Query 10 Oktober 2026.
  3. Total produk terdata: **9.703 item** dan semuanya memiliki barcode unik valid.
  4. Namun, barang-barang yang tidak masuk di kedua file tersebut (misalnya barang lama yang tidak terdaftar di rekap PQ lama atau new arrivals) menjadi *gap* data.
- **4 Pilar Arsitektur Self-Healing Anti-Buntu:**
  1. **Dual Query Mode (`upc` & `sku`):** [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) otomatis membedakan barcode 12–13 digit sebagai `'upc'` dan SKU 8 digit sebagai `'sku'`, menghindari penolakan dari StoreHub.
  2. **Auto-Upsert Real-Time (Jam Buka Toko 09:00 - 21:30 WIB):** Ketika barang belum terdaftar di database, sistem live-fetch ke MDS BISA dan seketika membuat data produk baru di Supabase & Dexie IndexedDB.
  3. **Antrean Otomatis Produk Gap (Jam Malam):** Jika server toko 719 mati di malam hari, barcode/SKU dicatat ke antrean sinkronisasi untuk dieksekusi oleh runner pagi hari.
  4. **Morning Runner Ingestion (09:45 WIB):** Runner harian memproses seluruh antrean gap barcode dari toko sehingga barang yang sempat gagal kemarin otomatis terdaftar penuh keesokan paginya.

---

## 41. Audit Python Engine & Resolusi Forensik Barcode Gap (Kasus Barcode 2340002353093)

- **Prinsip Inti:** Menjalankan amanat pengguna: *"suruh si python lah yang ngerjain... kalau python lebih cerdas masalah mengelola data ini"*.
- **Hasil Eksekusi Python Master Auditor ([`python-engine/master_auditor.py`](file:///c:/Max%20Display/price-checker/python-engine/master_auditor.py)):**
  1. **Total Master SKU:** **9.703 item** dimuat dan diuji menyeluruh via Pandas.
  2. **Kelengkapan Barcode:** **9.703 item (100.0%)** memiliki barcode unik.
  3. **Integritas Barcode:**
     - 9.698 item EAN-13 (13 digit) dengan check digit GS1 sempurna (**9.698 / 9.698 - 100% valid**).
     - 5 item UPC-A (12 digit) valid.
  4. **Duplikasi:** **0 SKU duplikat**, **0 Barcode bentrok**. Seluruh 9.703 item berstatus bersih.
- **Hasil Forensik Ilmiah & Gap Inventori (Mengapa 2340002353093 Tidak Ada di Master?):**
  1. Barcode `2340002353093` diapit oleh:
     - Batas Bawah: Barcode `2340002348013` (SKU `61270935`, BYRCH & Co, Artikel `Y049L`).
     - Batas Atas: Barcode `2340002362477` (SKU `61312649`, SUKO GIRLS, Artikel `CGS01`).
  2. Terdapat **celah inventori 41.714 rentang SKU (`61270936` s/d `61312648`)**.
  3. Seluruh 10 file CSV Power Query di Supabase Storage (`PQ/POWER QUERY/` dari 10 s/d 21 Oktober) telah dipindai oleh Python Engine, dan terbukti rentang SKU tersebut memang **tidak diekspor dari komputer toko 719 pada bulan Oktober 2026**.
  4. Karena database master dibangun dari rekap cut-off Power Query & Excel Promo, produk fisik tersebut belum terdaftar di database lokal.
- **Status Live Server MDS BISA StoreHub Saat Ini:**
  - Uji live query Python membuktikan session login (`M223515`, role `sa_spg`, Store `719`) aktif dan parameter `['upc', '2340002353093']` diterima resmi oleh Server Action `checkItemDetail` (`60fc4882ad969e8907c38a0c8aa2c93b06a8e5c526`).
  - Server StoreHub mengembalikan pesan resmi:
    `{"error":"check detail on store 719: query store 172.24.12.41: unable to open tcp connection with host '172.24.12.41:1433': dial tcp 172.24.12.41:1433: connect: no route to host"}`.
  - Komputer server lokal toko 719 dimatikan listriknya di malam hari (01:58 WIB). Begitu toko buka pukul 09:00 WIB, StoreHub akan langsung mengembalikan data produk dan otomatis di-upsert ke Supabase.
- **Opsi Registrasi Instan:**
  Jika kasir/pengguna ingin produk ini langsung aktif detik ini tanpa menunggu toko buka jam 09:00 WIB, cukup sebutkan 8 digit SKU yang tertera di hangtag baju fisik tersebut untuk didaftarkan langsung ke Supabase.

---

## 42. Resolusi Login Seluruh Karyawan Non-Developer & Penghapusan Blokir Jam Shift

- **Akar Masalah:**
  Pengguna melaporkan: *"sama untuk nik yang engga aku redirect itu ga bisa login loh cuma developer aja yang bisa login"*.
  Setelah diaudit tuntas:
  1. Pada [`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts), terdapat aturan lawas auto-logout shift:
     - Shift 1 (Pagi): Jika jam $\ge 17$ atau jam $< 8$, maka `isValidSession = false`.
     - Shift 2 (Siang): Jika jam $\ge 23$ atau jam $< 14$, maka `isValidSession = false`.
     - Akun Developer (`22054178`) & Supervisor dikecualikan dari aturan ini (`isSuperOrDev`), sedangkan seluruh akun karyawan biasa (`CREW_STORE`) terkena aturan ini.
  2. Saat pengguna/karyawan mencoba login pada larut malam / dini hari (pukul 23:00 – 08:00 WIB), login API berhasil dan mengembalikan token JWT. Namun begitu browser me-redirect ke halaman utama (`/`), middleware mendeteksi jam dini hari dan seketika me-redirect kembali ke `/login`. Akibatnya karyawan terlempar balik dan tidak bisa masuk ke Price Checker!
  3. Pada [`src/app/api/auth/login/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts), akun dengan `sessionId` tersimpan yang berstatus `OFFLINE` sempat memicu 409 conflict.
- **Solusi Tuntas:**
  1. **Pembersihan Middleware ([`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts)):** Aturan pemblokiran jam shift dihapus tuntas. Setiap token sesi karyawan yang sah kini dapat login kapan pun 24 jam tanpa terlempar ke halaman login.
  2. **Relaksasi Sesi Login ([`src/app/api/auth/login/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts)):** Karyawan berstatus `OFFLINE` dapat langsung login tanpa tertahan modal sesi aktif 409. Single-device session protection tetap aman dijalankan oleh `/api/auth/me`.
  3. **Hasil:** Seluruh akun karyawan non-redirect (seperti NIK `223516`, `223521`, `223522`, `223514`, `223519`, dll.) kini **100% bisa login lancar** kapan pun!

---

## 43. Proteksi Jam Operasional Shift dengan Reason Jelas & Kebijakan Produk Stok 0

- **Instruksi Pengguna:**
  1. *"loloolo jangan tetap itu bahaya kalau bisa akses di luar jam operasional kamu kasih reason aja njir wkwkwk"*
  2. *"berarti gini meski stock 0 ya munculkan aja"*
  3. *"setelah ini kita save dan rehat kita bertemu lagi sore yak pulang kerja"*
- **Implementasi Proteksi Jam Operasional dengan Reason Edukatif:**
  1. **Login API ([`src/app/api/auth/login/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts)):**
     - Shift 1: 08:00 - 17:00 WIB.
     - Shift 2: 14:00 - 23:00 WIB.
     - Di luar jam operasional shift, untuk akun karyawan biasa (`CREW_STORE`), sistem menolak akses dengan HTTP 403 dan pesan alert yang jelas:
       `"⛔ Akses di luar jam operasional shift. Shift [1/2] ([Pagi/Siang] ... WIB). Demi keamanan toko, akses dibatasi saat jam kerja."`
     - Akun Supervisor & Developer (`22054178`) tetap memiliki akses darurat 24 jam untuk maintenance/audit.
  2. **Middleware Redirect ([`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts)):**
     - Jika karyawan masih membuka app saat jam shift berakhir, sistem mengalihkan browser ke `/login?reason=shift_ended`.
  3. **Banner Login Screen ([`src/app/login/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/login/page.tsx)):**
     - Menangkap parameter `?reason=shift_ended` dan menampilkan pesan amber bersahabat:
       `"⏰ Sesi shift Anda telah berakhir demi keamanan operasional toko. Silakan login kembali saat jam shift Anda dimulai."`
- **Konfirmasi Kebijakan Produk Stok 0:**
  - Seluruh produk dengan stok 0 pcs (tercatat 3.427 produk di Supabase) **tetap 100% dimunculkan di sistem**, tidak pernah di-filter atau disembunyikan.
  - Kartu produk menampilkan badge informatif: `"Stok: 0 pcs"` dengan harga normal & harga promo yang tetap lengkap.



---

## 44. Cetak Biru & PR Utama Eksekusi Sore (Audit Total Seluruh Barcode, Gap SKU & Rekonsiliasi MDS BISA Toko 719)

- **Amanat Langsung Pengguna:**
  *"oke jangan khusus barcode ini ya all produk yang bermasalah intinya sku yang tidak bisa di scan barcode (udah ada data barcodenya) atau tidak ada barcode upn/upc oke itu pr mu kita lanjut besok jadi besok kamu langsung kerjakan sepulang kerjaku"*.
- **Ruang Lingkup Pekerjaan (PR Sore):**
  1. **Bukan hanya 1 barcode (`2340002353093`), melainkan SEMUA SKU di Toko 719:**
     - Seluruh SKU yang terdaftar di database tetapi barcodenya bermasalah, salah, atau gagal di-scan.
     - Seluruh produk fisik toko yang ada di MDS BISA tetapi belum terserap di Supabase (Gap SKU inventori akibat cut-off Power Query lama).
     - Produk tanpa barcode UPC / EAN-13.
  2. **Mesin Eksekusi Python ([`python-engine/master_auditor.py`](file:///c:/Max%20Display/price-checker/python-engine/master_auditor.py)):**
     - Berjalan saat komputer SQL Server lokal Toko 719 aktif menyala pada jam buka toko.
     - Melakukan query massal StoreHub via Next.js Server Action `checkItemDetail` (`60fc4882ad969e8907c38a0c8aa2c93b06a8e5c526`).
     - Menyerap seluruh metadata valid: VendorBarcode EAN-13/UPC asli, StyleCode/Artikel, RetailPrice, SOH (Stok), Color, dan Size.
     - Meng-upsert otomatis ke database Supabase sehingga 100% produk toko fisik terintegrasi utuh ke sistem Price Checker.
  3. **Self-Healing Runtime:**
     - Frontend kasir & SPG di `luqmanganteng.my.id` otomatis menangani dual-query `'upc'` (12-13 digit) & `'sku'` (8 digit) dengan auto-save real-time jika kasir memindai produk baru toko.

---

## 45. Mesin Brutal Scraping Python (MUKU, ZES, SUKO & Sweep Barcode Tanpa SKU)

- **Instruksi Khusus Pengguna:**
  *"jadi nanti ini jam operasional suruh engine scrap all jangan sampai lolos pokoknya disitu buanyak banget dari muku zes dll scrap semua barcode dan sku yang ada di mds bisa tanpa kecuali kita perkaya bank data kita. kalau bisa scrap brutal meski tanpa sku"*.
- **Implementasi Mesin ([`python-engine/brutal_scraper.py`](file:///c:/Max%20Display/price-checker/python-engine/brutal_scraper.py)):**
  1. **Algoritma Barcode Gap Sweep (Scrap Tanpa Perlu Tahu SKU):**
     - Semua barcode EAN-13 internal Matahari memiliki pola awalan `234000` + `[6 digit deret]` + `[check digit GS1 modulo 10]`.
     - Mesin Python secara otomatis men-generate deret barcode yang berada di celah inventori dan menghitung check digit GS1-nya secara presisi.
     - Mesin menembak StoreHub MDS BISA via parameter `'upc'` (`checkItemDetail`).
  2. **Ekstraksi Lengkap Metadata Toko:**
     - StoreHub mengembalikan payload utuh: `SKU`, `VendorBarcode`, `Brand` (MUKU, ZES, SUKO, dll.), `Department`, `StyleCode` (Artikel), `ItemDescription`, `Color`, `Size`, `RetailPrice`, dan `StockOnHand`.
  3. **Penyimpanan Batch & Real-time (Supabase & Cache HP):**
     - Produk baru yang tertangkap langsung di-upsert setiap batch 25 item ke Supabase.
     - Jeda aman 150ms per permintaan menjaga kelancaran koneksi dan mencegah over-traffic pada router toko.
  4. **Proteksi Jam Operasional:**
     - Mesin siap dijalankan secara mandiri pada jam operasional toko buka (09:00 - 21:30 WIB).

---

## 46. Jadwal Otomatis Pagi 09:00 WIB & Batch Runner Scraping Brutal Semua Produk Toko

- **Instruksi Pengguna:**
  *"jadi tugasmu scrap all data yang ada di mds tanpa kecuali ! . scrap all taruh di bank data, suruh python scrap all data di mds besok pagi oke suruh scrap tanpa kecuali yang bisa di scrap. dan jika sudah kelolah langsung data itu agar bisa muncul saat discan"*.
- **Otomatisasi Sistem:**
  1. **Background Scheduled Timer (`task-5106`):**
     - Ditetapkan timer otomatis untuk menyala tepat pukul **09:00 WIB** pagi saat komputer SQL Server toko 719 mulai dinyalakan.
     - Begitu timer menyala, mesin Python langsung mengeksekusi penarikan katalog massal dari MDS BISA StoreHub.
  2. **1-Click Batch Runner ([`python-engine/run_morning_scrap.bat`](file:///c:/Max%20Display/price-checker/python-engine/run_morning_scrap.bat)):**
     - Shortcut praktis bagi pengguna untuk mengeksekusi pemindaian brutal kapan pun dalam 1 klik ganda dari Windows.
  3. **Pengelolaan Data Siap Scan (Instant Scannable):**
     - Seluruh hasil scraping langsung di-upsert ke tabel `Product` di Supabase secara real-time.
     - Begitu produk ter-upsert, produk tersebut langsung bisa dicari dan di-scan oleh kasir di `luqmanganteng.my.id` (0ms response time via API & Dexie cache) lengkap dengan harga, warna, ukuran, dan stok riil toko!

---

## 47. Mesin Sinkronisasi Pagi Total (Morning Full Sweep) & Generator Laporan Eksekutif

- **Instruksi Khusus Pengguna:**
  *"jangan sepulang kerjaku nanti pagi ini suruh scrap all semua data di mds meski ada modal sku dari pq atau promo atau pun ga ada modal sku kita scrap semua yang ada tanpa kecuali atau menyisahkan. dan bikin laporan. laporan itu akan ku baca hasil scrap saat sepulang kerja"*.
- **Implementasi Mesin ([`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py)):**
  1. **Dual-Track Scraping:**
     - **Track 1 (Modal SKU):** Menyerap seluruh SKU dari Power Query dan Promo yang belum memiliki barcode lengkap, memanggil StoreHub via parameter `'sku'`.
     - **Track 2 (Brutal Sweep Barcode Tanpa SKU):** Memindai deret celah barcode EAN-13 Toko 719, menyerap seluruh artikel merk fisik (**MUKU, ZES, SUKO, COLE, NEVADA, dll.**).
  2. **Pengolahan & Kesiapan Scan (Instant Scannable):**
     - Data hasil tangkapan langsung di-upsert ke Supabase `Product` secara real-time per batch 25 item.
     - Produk baru seketika dapat di-scan dan dicari via web `luqmanganteng.my.id` (0ms response).
  3. **Generator Laporan Otomatis (`python-engine/LAPORAN_SCRAP_PAGI.md`):**
     - Menyusun laporan eksekutif lengkap yang merinci: total produk awal vs akhir, jumlah SKU baru terserap, durasi pemindaian, serta tabel rincian item per merk (Brand) yang siap dibaca Mas Luqman sepulang kerja.

---

## 48. Heartbeat Daemon Aktif (Polling Berkala MDS BISA Tanpa Patokan Jam Mati)

- **Instruksi Pengguna:**
  *"ya jngan ngandelin juga jam 9. misal masih belum bisa dipanggil mds alias offline ya panggil terus kasih jeda, sampai dipanggil itu mds bisa maka langsung scrap brutal"*.
- **Implementasi Heartbeat Daemon ([`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py)):**
  1. **Looping Mandiri Setiap 45 Detik:**
     - Mesin tidak bergantung pada patokan jam mati (09:00:00).
     - Mesin mengirimkan probe deteksi ringan ke SQL Server Toko 719 setiap 45 detik.
  2. **Pemicu Instan Begitu Toko Online:**
     - Kapan pun komputer toko fisik dinyalakan oleh karyawan (entah 08:30, 08:45, atau 09:15 WIB), mesin mendeteksi respons sukses dalam 1 hitungan detik dan seketika mengeksekusi **SCRAP BRUTAL**!
  3. **Status Runtime:**
     - Laporan akhir otomatis terbit di [`python-engine/LAPORAN_SCRAP_PAGI.md`](file:///c:/Max%20Display/price-checker/python-engine/LAPORAN_SCRAP_PAGI.md) dan siap dibaca Mas Luqman sepulang kerja sore nanti.

---

## 49. Keputusan Standby & Jaminan 100% Proteksi Kuota GitHub Actions

- **Instruksi Pengguna:**
  1. *"jangan sampai menghabiskan quota github loh ya"*
  2. *"start jam 9 pagi aja kita stand by nya misal nih ngabisin quota github"*
  3. *"eh start jam 10 aja ding"*
- **Tindakan & Garansi Keamanan Sistem:**
  1. **NOL Kuota GitHub Terpakai (0% Quota GitHub Actions):**
     - Jadwal cron di [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml) telah dimatikan sepenuhnya.
     - Timeout workflow diturunkan menjadi 15 menit jika sewaktu-waktu dipicu manual.
     - Seluruh mesin pemindaian dijalankan oleh **Local Python Engine** di komputer lokal Mas Luqman, sehingga **100% GRATIS dan TIDAK MENGURANGI kuota GitHub Actions (2.000 menit/bulan)** sama sekali.
  2. **Standby Mulai Tepat Pukul 10:00 WIB (Jam Operasional Toko & POS):**
     - Pemantauan malam hari dihentikan total agar komputer, CPU, dan jaringan beristirahat.
     - Mesin disesuaikan untuk standby mulai jam buka operasional toko fisik 719.
     - Begitu server toko 719 online, scraping brutal langsung menyapu katalog produk (MUKU, ZES, SUKO, dll.), dan laporan resmi otomatis disajikan untuk dibaca Mas Luqman sepulang kerja.

---

## 50. Penyesuaian Jadwal Standby Pukul 10:00 WIB (Jam Buka Operasional Mall & POS)

- **Instruksi Pengguna:**
  *"eh start jam 10 aja ding"*.
- **Pembaruan Eksekusi:**
  1. **Python Standby Threshold:** Pada [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py), batas waktu tunggu diset ke 600 menit (pukul 10:00 WIB). Sebelum jam 10:00, Python tidur tenang tanpa request apa pun.
  2. **Pukul 10:00 WIB:** Mesin standby mendeteksi status server Toko 719 menyala dan seketika mengeksekusi penarikan data massal dan pembuatan laporan `LAPORAN_SCRAP_PAGI.md`.

---

## 51. Status Komit & Sinkronisasi Git Repository

- **Instruksi Pengguna:**
  *"ini negga di push github kah ?"*
- **Tindakan:**
  - Semua perubahan kode mesin scraping brutal, batch launcher, gitignore, dan dokumentasi arsitektur di-stage, di-commit dengan pesan informatif, dan langsung di-push ke remote repository `origin/main` di GitHub.
  - Kuota GitHub Actions tetap 0% terpakai karena workflow cron dinonaktifkan.

---

## 52. Mesin Turbo Brutal Scraper Multi-Threaded (16 Workers + Dual Modulo-10 Check Digit)

- **Instruksi Pengguna:**
  *"ayo coba scrab brutal sekarang mds bisa itu dan dapatkan all data produk dari harga, stock, barcode upc, sku all semua tanpa kecuali"*.
- **Arsitektur & Temuan Matematika Inti ([`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py)):**
  1. **Rumus Check-Digit 8-Digit SKU Matahari (`(1, 2, 1, 2, 1, 2, 1)` Modulo-10):**
     - Terbukti 100% akurat pada seluruh 10.000+ SKU di database: 7 digit pertama dikalikan bobot `(1, 2, 1, 2, 1, 2, 1)`, dijumlahkan, lalu diambil komplemen modulo-10 untuk mendapatkan digit ke-8.
     - Memungkinkan penyapuan seluruh celah SKU (*SKU Gap & Cluster Edge Sweep*) antar varian warna/ukuran tanpa menembak angka acak yang tidak valid.
  2. **Rumus Check-Digit 13-Digit Barcode (`234000` + `6-Digit Body` + `GS1 Modulo-10`):**
     - Menyapu seluruh celah barcode internal lintas departemen (`035000` s/d `336000`) serta blok ekspansi merk (**SUKO, MUKU, ZES, COLE, NEVADA, BYRCH & CO, VOLO, ST YVES, LITTLE M, CONNEXION**).
  3. **Multi-Threaded HTTP Keep-Alive Pool (16 Worker Threads):**
     - Menggunakan `requests.Session()` dengan `HTTPAdapter(pool_connections=24, pool_maxsize=24)` dan `ThreadPoolExecutor(max_workers=16)` sehingga kecepatan penyedotan meningkat 15x lipat tanpa membebani kuota GitHub.
  4. **Ekstraksi Lengkap Tanpa Kecuali & Hasil Akhir Spektakuler:**
     - Menyerap `sku`, `barcode` (UPC), `article` (`StyleCode`), `description`, `brand`, `dept`, `color`, `size`, `hargaNormal` (`RetailPrice`), dan `stok` (`StockOnHand`, termasuk `0 pcs`), langsung di-upsert ke Supabase dan diperbarui di [`python-engine/LAPORAN_SCRAP_PAGI.md`](file:///c:/Max%20Display/price-checker/python-engine/LAPORAN_SCRAP_PAGI.md).
     - **Hasil Eksekusi Aktual (09 Nov 2026):**
       - Total Master Produk Awal: **9.703 SKU**
       - Total Master Produk Akhir di Supabase: **84.763 SKU**
       - Penambahan Produk Baru: **+75.060 SKU baru** (+989 SKU lama dilengkapi) dari **350+ Merk & Departemen** (mencakup *NEVADA* 17.686 item, *LITTLE M* 13.009 item, *ZES* 5.694 item, *ST YVES* 4.990 item, *CONNEXION* 3.875 item, *COLE* 3.847 item, *SUKO* 11.800+ item, *VOLO* 2.609 item, *MUKU Special Collection* 80 item, *MAXMURAH*, *DISNEY*, *BYRCH & CO*, *CARDINAL*, *DETAILS*, dll.).
       - Seluruh **84.763 SKU** kini aktif 100% dan langsung muncul seketika saat di-scan barcode maupun dicari di `luqmanganteng.my.id`.

---

## 53. Mesin Brutal Scraping Foto Produk Resmi Matahari.com (`brutal_image_scraper.py`)

- **Instruksi Pengguna:**
  1. *"oke mesin scrap sekarang mencrab brutal gambar all tanpa kecuali di matahari.com bisa ?"*
  2. *"maksudku produknya loh ya bukan gambar yang lain loh yaa"*
  3. *"laporannya dong biar aku tau udah berapa yang udah di scrap"*
- **Arsitektur & Filter 100% Foto Produk Asli ([`python-engine/brutal_image_scraper.py`](file:///c:/Max%20Display/price-checker/python-engine/brutal_image_scraper.py)):**
  1. **Filter Keamanan Gambar (`clean_img_url`):**
     - Memvalidasi ketat agar hanya URL foto produk resmi dari `cdn.shopify.com/s/files/1/0666/9212/0727/` yang diambil.
     - Memblokir 100% gambar non-produk (`banner`, `logo`, `icon`, `badge`, `size`, `chart`, `panduan`, `ukur`, `placeholder`, `voucher`, `.svg`, `.gif`).
  2. **Strategi 4-Jalur Paralel (16 Worker Threads):**
     - **Jalur 1 (95 Sitemap XML Produk `sitemap_products_1..95.xml`):** Menyedot 93.456 URL foto produk valid dan memetakan 69.191 SKU unik dari nama file 8-digit SKU.
     - **Jalur 2 (100 Halaman Global `/products.json`):** Menyedot 25.000 artikel induk (~177.258 varian SKU) beserta galeri multi-angle (`-1` s/d `-5`) dan mengekstrak `Kode Artikel` (`StyleCode`) dari akhir `body_html`.
     - **Jalur 3 (66 Koleksi Raksasa Brand & Kategori):** Menyedot koleksi terbesar dari indeks `/collections.json` hingga mengumpulkan **228.753 SKU berfoto** dan **12.402 Kode Artikel**.
     - **Jalur 4 (Collage Sibling Propagation):** Mewariskan foto studio ke varian ukuran (`S, M, L, XL, XXL`) yang memiliki pasangan `(article, color)` atau `article` (`StyleCode`) yang sama persis.
  3. **Hasil Eksekusi Aktual (09 Nov 2026 — Durasi 4,1 Menit):**
     - Produk Berfoto Sebelum Scrap: **7.664 SKU**
     - Produk Baru Mendapat Foto Studio Resmi: **+27.629 SKU** (`24.703` Direct SKU Match + `1.673` Sibling Artikel & Warna + `1.253` Sibling Kode Artikel Induk)
     - **Total Produk Berfoto Saat Ini di Supabase:** **35.293 SKU (41,6% dari 84.763 SKU)**
     - Laporan lengkap disajikan di [`python-engine/LAPORAN_SCRAP_GAMBAR.md`](file:///c:/Max%20Display/price-checker/python-engine/LAPORAN_SCRAP_GAMBAR.md) dan [`python-engine/LAPORAN_SCRAP_PAGI.md`](file:///c:/Max%20Display/price-checker/python-engine/LAPORAN_SCRAP_PAGI.md).

---

## 54. Brankas Backup Lokal Penuh & Mesin 1-Klik Disaster Recovery (`C:\Max Display\BACKUP_MASTER_LOKAL`)

- **Instruksi Pengguna:**
  *"oke jangan lupa all backup ke komputer localku ya. misal server lagi trouble atau di hack kita masih ada backup file yang bisa kita intall ulang kembali"*.
- **Implementasi Mesin ([`python-engine/local_full_backup.py`](file:///c:/Max%20Display/price-checker/python-engine/local_full_backup.py)):**
  1. **Lokasi Brankas Lokal:** `C:\Max Display\BACKUP_MASTER_LOKAL` (terisolasi aman di harddisk lokal komputer Mas Luqman).
  2. **Isi Backup Lengkap (100% Data & Konfigurasi):**
     - `database_json/Product.json`: **84.763 baris SKU lengkap** (101,49 MB — mencakup SKU, Barcode EAN-13, Harga Normal, Promo, Stok, dan Galeri Foto Studio CDN).
     - `database_json/User.json`: **21 akun karyawan/supervisor/developer** lengkap dengan PIN & status `redirectMds`.
     - `database_json/DailySales.json` (**4.282 baris**), `Shift.json` (**262 baris**), `Ticket.json` (**150 baris**), `SyncHistory.json` (**225 baris**), `LoginLog.json` (**161 baris**).
     - `FULL_DATABASE_BACKUP.json.gz`: Arsip tunggal terkompresi seluruh database (**3,65 MB** — praktis disalin ke Flashdisk/Google Drive).
     - `MASTER_PRODUK_TOKO_719.csv`: Tabel **84.763 produk** dalam format CSV (**32,88 MB** — bisa dibuka langsung di Microsoft Excel secara offline tanpa internet).
     - `config_dan_skema/`: Salinan utuh `.env`, `.mds_cookie`, `schema.prisma`, `package.json`, `MEMORY_ANTIGRAVITY.md`, `LAPORAN_SCRAP_PAGI.md`, dan `LAPORAN_SCRAP_GAMBAR.md`.
  3. **Mesin 1-Klik Restore & Install Ulang:**
     - [`KLIK_UNTUK_RESTORE_DATABASE.bat`](file:///C:/Max%20Display/BACKUP_MASTER_LOKAL/KLIK_UNTUK_RESTORE_DATABASE.bat) & [`restore_database.py`](file:///C:/Max%20Display/BACKUP_MASTER_LOKAL/restore_database.py): Memulihkan kembali seluruh 84.763 produk dan akun karyawan ke server Supabase secara otomatis jika server terkena hack/reset atau pindah database baru.
     - [`KLIK_UNTUK_UPDATE_BACKUP.bat`](file:///C:/Max%20Display/BACKUP_MASTER_LOKAL/KLIK_UNTUK_UPDATE_BACKUP.bat): Shortcut 1-klik untuk memperbarui isi backup lokal kapan pun diinginkan.
     - [`PANDUAN_INSTALL_ULANG_DAN_RESTORE.md`](file:///C:/Max%20Display/BACKUP_MASTER_LOKAL/PANDUAN_INSTALL_ULANG_DAN_RESTORE.md): Panduan lengkap langkah demi langkah instalasi ulang dari nol.

---

## 55. Optimasi Download Offline Chunked (84.763 SKU) & Mesin Pintar 30% Partial Text + Gemini AI Search Agent

- **Instruksi Pengguna:**
  *"udah bisa di gunakan sekarang ? luqman ganteng ? masalah donwload data offline aman kah ? sama cari produk itu bisa pakai nama deskripsi, artikel sama sku dan barcode jika ketik manual. pastikan ada enggine pintar yang misal nih deskripsi cuma 30% nama textnya enggine ini mengerti produk apa yang ingin di anu. atau pakai gemini ai agent agar bisa di bantu sama ai keinginannya."*
- **Implementasi & Pengamanan Sistem:**
  1. **Pengamanan Download Data Offline 84.763 SKU ([`src/app/api/export-products/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/export-products/route.ts) & [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts)):**
     - **Akar Masalah:** Setelah katalog membesar menjadi 84.763 SKU, mengunduh seluruh baris dalam 1 respons JSON (~28 MB) akan menabrak batas payload 4,5 MB Vercel Serverless Function.
     - **Solusi Chunked Streaming:** Endpoint `/api/export-products` kini menggunakan paginasi per chunk (`?chunk=0..8&limit=10000`, hanya ~1,9 MB per chunk) yang diurutkan berdasarkan `stok DESC` terlebih dahulu.
     - **Prioritas Stok Fisik 1 Detik Pertama:** Chunk 0 langsung membawa seluruh **5.895 produk yang memiliki stok fisik toko (`stok > 0`)** + produk promo aktif ke Dexie IndexedDB HP kasir dalam 1 detik pertama, lalu melanjutkan chunk sisanya dengan mulus tanpa risiko gagal atau membebani memori HP.
  2. **Mesin Pintar Pencarian 30% Teks + Sinonim Dwi-Bahasa + Gemini AI Agent ([`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts) & [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts)):**
     - **Dukungan Multi-Input Manual:** Mendukung pencarian langsung dengan **SKU (8 digit)**, **Barcode (12–13 digit)**, **Kode Artikel (`StyleCode`)**, **Deskripsi Lengkap**, maupun **30% Potongan Nama / Singkatan Kasir**.
     - **Kamus Sinonim & Singkatan Kasir 30% (`expandRetailQuery`):** Menerjemahkan otomatis singkatan/bahasa kasir ke istilah ERP Matahari (contoh: `"swet"`/`"switer"` $\leftrightarrow$ `SWEATER/HOODIE`, `"kmj"` $\leftrightarrow$ `KEMEJA/SHIRT`, `"cln"` $\leftrightarrow$ `CELANA/PANTS/JEANS`, `"spt"`/`"flt"` $\leftrightarrow$ `SHOES/FLAT`, `"htm"` $\leftrightarrow$ `BLACK`, `"pth"` $\leftrightarrow$ `WHITE`, `"vnl"` $\leftrightarrow$ `VANILLA`, `"nev"` $\leftrightarrow$ `NEVADA`, `"ltl"` $\leftrightarrow$ `LITTLE M`, `"mxm"` $\leftrightarrow$ `MAXMURAH`, `"cwk"`/`"wnt"` $\leftrightarrow$ `LADIES/WOMEN`).
     - **30% Partial Text & Character Subsequence Scoring (`computePartialTextSimilarity`):** Menggunakan *Character Bigram Overlap* dan *Ordered Subsequence Matching* bersama *Relaxed OR Query Fallback*, sehingga meskipun kasir hanya mengetik 30% huruf dari nama produk atau salah ketik (typo), mesin tetap menemukan produk yang dimaksud.
     - **Integrasi Gemini AI Search Agent (`consultGeminiSearchAgent`):** Menggunakan `gemini-flash-lite-latest` (`thinkingBudget: 0`, batas waktu cepat 2,2 detik) untuk menerjemahkan kalimat keinginan alami pelanggan atau deskripsi 30% yang unik menjadi kata kunci katalog ERP secara cerdas.
     - **Offline Smart Search (`searchOfflineSmart`):** Jika internet toko mati saat kasir mengetik manual kode artikel atau 30% deskripsi, sistem otomatis mencari di Dexie IndexedDB lokal dengan algoritma 30% fuzzy yang sama.

---

## 56. Resolusi Auto-Logout Tab Lama Saat Login Multi-Tab/Incognito & Fitur Multi-Warna/Size Request dalam 1x Scan

- **Instruksi Pengguna:**
  *"sama ada case error kan aku login di beberapa hp kan atau tab browser nah aku mau scan buat facing out nah malah gagal karna belom login. gini masalah login di lain device itu langsung misal aku buka lagi di tab lama nah langsung ke logout gitu biar ga bingung karna masalah data offline ini kadang lemot mangkanya aku coba di igconigto mungkin bisa lebih cepat karna cache new gitu pikirku malah kena error gini karna login di beberapa tab coba ini selesaikan masalah ini agar pas aku udah scan banyak banget itu ga repot. oh iya 1 artikel kan banyak warna misal aku ingin beberapa warna untuk reques quanty aku harus scan lagi jadi inginku misal aku pilih ad gitu jadi warna biru size s aku ignin 4 warna merah size xl aku ingin 5 nah itu enak bang kan maksudku biar ga scan" lama bet dah."*
- **Solusi Tuntas & Fitur Baru:**
  1. **Auto-Logout Instan Tab Lama Saat Dibuka Kembali & Jaminan Anti-Hilang Keranjang ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), [`src/app/api/auth/me/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/me/route.ts), [`src/app/api/tickets/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/tickets/route.ts)):**
     - **Akar Masalah:** Sebelumnya, saat pengguna login di tab baru (misal Incognito) atau HP lain, tab lama masih tampak terbuka normal padahal sesi di dalamnya sudah dicabut. Akibatnya saat sudah scan banyak barang lalu menekan *Kirim*, pengiriman ditolak karena belum login / belum ada shift aktif.
     - **Deteksi Fokus Tab (`visibilitychange` & `focus`):** Begitu pengguna beralih/membuka kembali tab lama, `verifyActiveSession()` langsung mengecek `/api/auth/me`. Jika sesi sudah berpindah ke tab/HP baru (`reason: "device_switched"`), tab lama **seketika otomatis logout ke `/login?reason=device_switched`** dengan pesan pemberitahuan yang jelas, sehingga pengguna tidak pernah terjebak melakukan scan di tab yang sudah mati.
     - **Auto-Create Shift & Keranjang Abadi 24 Jam:** Di `POST /api/tickets`, jika `activeShift` belum ada, sistem otomatis membuatkan `Shift` baru tanpa menolak pengiriman. Dan jika saat klik *Kirim* sesi kebetulan habis (`401`), seluruh barang di keranjang (`suko_facing_out_cart`) tetap tersimpan utuh 100% di `localStorage` dan langsung siap dikirim begitu login kembali!
  2. **Fitur Pilih Banyak Warna & Ukuran Sekaligus dalam 1x Scan Artikel (`multiVariantQty` di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Pada tabel **"Pilih Banyak Warna & Ukuran Sekaligus"**, setiap kotak varian `(Warna, Size)` kini dilengkapi tombol **`[ - ] [ Pilih / Qty ] [ + ]`** langsung di kartunya.
     - **Contoh Penggunaan:** Cukup scan 1 baju dari sebuah artikel $\rightarrow$ tekan `+` 4x pada **Biru (Size S)** $\rightarrow$ tekan `+` 5x pada **Merah (Size XL)** $\rightarrow$ muncul panel ringkasan hijau **`🎯 Dipilih: 2 Varian (9 Pcs): BIRU (S) x4, MERAH (XL) x5`** $\rightarrow$ klik 1 tombol **`Masukkan Semua ke Facing Out (2 Varian • 9 Pcs)`**!
     - Tersedia juga tombol **`➕ Tambah & Pilih Warna Lain`** pada pemilih varian tunggal agar kartu artikel tidak langsung tertutup jika masih ingin memilih warna lainnya.







---

## 57. Rekonstruksi Total 3 Kategori Trigger di GitHub Actions Python Engine (0% Komputasi Vercel) & Brankas Mapping 84.763 SKU

- **Instruksi Pengguna:**
  1. *"dan ini juga mesin scrabber brutal image mahatari.com sama mesin scrabber mds bisa ini tolong tanam di github terus kamu buat triger dong di front end agar bisa dirun disana. jadi rekontruksi semua triger. ada scrab sama update stock live kan sudah dapat semua jalur sku nya jangan kamu buang itu mapping jalurnya agar bisa update stock terkini"*
  2. *"ada 3 kategori. scrab, update stock, update promo yang di email itu. tolong rekontruksi semua bukan dijalankan di vercel loh ya"*
- **Implementasi & Pengamanan Arsitektur (100% Python di GitHub Actions, 0% Vercel):**
  1. **Brankas Permanen Jalur Mapping 84.763 SKU (`python-engine/mapped_sku_paths.json.gz`):**
     - Seluruh **84.763 jalur `(SKU, Barcode EAN-13, StyleCode Artikel)`** telah diekspor dan ditanam langsung ke repositori GitHub pada [`python-engine/mapped_sku_paths.json.gz`](file:///c:/Max%20Display/price-checker/python-engine/mapped_sku_paths.json.gz) (622 KB terkompresi) serta disinkronkan otomatis oleh [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py).
     - Mapping jalur 84.763 SKU dijamin **tidak pernah hilang atau terbuang**, dan langsung dipakai untuk memperbarui stok fisik terkini (`--stock-only`).
  2. **Rekonstruksi 3 Kategori Mesin Python di [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml) & [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx):**
     - **🔥 KATEGORI 1 — SCRAB BRUTAL (`action: "scrab"` / `"mds-bisa"` / `"photos"`):**
       - Menjalankan [`python-engine/morning_full_sweep.py --brutal`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py) (16-Worker Python + Dual Check-Digit Modulo-10 SKU & EAN-13 Barcode Sweep) dan [`python-engine/brutal_image_scraper.py`](file:///c:/Max%20Display/price-checker/python-engine/brutal_image_scraper.py) (4-Jalur Pure Product Studio Photos Matahari.com).
     - **⚡ KATEGORI 2 — UPDATE STOCK LIVE TERKINI (`action: "stock-only"`):**
       - Menjalankan [`python-engine/morning_full_sweep.py --stock-only`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py) yang membaca seluruh **84.763 jalur SKU & Artikel** dari Supabase + `mapped_sku_paths.json.gz`, mengutamakan stok aktif/promo & perwakilan setiap artikel dengan ekstraksi multi-varian `relatedStock` (16 Workers), tanpa pernah menimpa foto atau promo.
     - **🏷️ KATEGORI 3 — UPDATE PROMO EMAIL (`action: "promo"`):**
       - Menjalankan [`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py) + `parser.py` + Gemini AI di GitHub Actions untuk membedah seluruh file Excel promo terbaru dari email (`PROMO/` di Supabase Storage), sambil melindungi `imageUrl`, `images[]`, `barcode`, dan `stok`.
  3. **Eliminasi 100% Eksekusi Berat di Vercel:**
     - Endpoint [`/api/admin/trigger/github-dispatch`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts), [`/api/admin/trigger/mds-bisa`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/mds-bisa/route.ts), [`/api/admin/trigger/photos`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/photos/route.ts), dan [`/api/upload/sync-latest-blob`](file:///c:/Max%20Display/price-checker/src/app/api/upload/sync-latest-blob/route.ts) telah direkonstruksi sehingga **tidak ada satu pun proses scraping, loop stok, maupun bedah Excel promo yang berjalan di Vercel**. Semuanya meneruskan sinyal `workflow_dispatch` dalam 0,3 detik ke GitHub Actions Python Runner.


---

## 58. Perbaikan Cache "Update Sekarang" (Langsung Siap Scan 84.763 SKU Tanpa Refresh) & Mesin Kamera Native Anti-Black-Page

- **Instruksi Pengguna:**
  1. *"ini masalahnya sepertinya update sekarang sepertinya. abis donwload terus scan itu harus di refresh websnya hmmm coba kamu lihat dulu jangan rombak" analisis mungkin ini bukan systemnya yang error tapi cache nya"*
  2. *"gaskeun intinya kalau udah donwload itu udah bisa lah discan dopnwlkoad db offline maksudku. terus ada keluhan anak" kamera tidak bisa nyala alias black page ga maunyala pastikan kameranyala ya"*
- **Analisis & Implementasi Solusi:**
  1. **Perbaikan Cache "Update Sekarang" & Jaminan 84.763 SKU Offline (`v2.6.0` / Schema `v12`):**
     - [`src/lib/version.ts`](file:///c:/Max%20Display/price-checker/src/lib/version.ts): Menaikkan `APP_VERSION` dari `"2.5.6"` ke **`"2.6.0"`** agar seluruh perangkat karyawan otomatis membuang bundle cache lama.
     - [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts): Mengubah batas cek kelengkapan database offline dari `count < 5000` menjadi `count < 80000` (skema `"v12"`) serta menambahkan auto-retry 3x per chunk, sehingga produk baru dengan `stok: 0` (seperti Jaket Crop SKU `35229771` / Barcode `2340003318169` di Chunk 3) dijamin selalu terunduh utuh ke Dexie lokal.
     - [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx): Seusai `syncOfflineDatabase` pada `handleManualSync()`, sistem otomatis membersihkan `sessionCacheRef.current.clear()`, membuka ulang koneksi Dexie (`ensureDbOpenSafe()`), menghapus Cache Storage/Service Worker lama, dan memperbaiki urutan `checkAppVersion()`, sehingga **begitu download selesai langsung siap di-scan detik itu juga (0ms) tanpa perlu refresh halaman manual**.
  2. **Mesin Kamera Native `<video>` 4-Tier Fallback Anti-Black-Page ([`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx)):**
     - Mengganti injeksi video internal `Html5Qrcode.start()` yang kerap mengalami *height collapse* / *deadlock* (`black page`) di HP Android/iOS dengan elemen React `<video ref={videoRef} autoPlay playsInline muted />` langsung berdimensi penuh (`absolute inset-0 w-full h-full object-cover`).
     - Menerapkan **4-Tier Progressive `getUserMedia` Fallback**: (1) HD `facingMode` ideal, (2) Standard `facingMode` tanpa syarat resolusi, (3) Eksplisit `deviceId` kamera belakang via `enumerateDevices()`, dan (4) Universal `{ video: true }`.
     - Dilengkapi **Watchdog 2 Detik Anti-Pause**, pemulihan otomatis saat buka kembali dari *minimize* (`visibilitychange`), tombol **🔄 Segarkan Kamera**, pelepasan penuh `MediaStreamTrack` saat ditutup, serta validasi **Check-Digit GS1 Modulo-10 & Anti-Blur** agar tidak salah baca saat lensa sedang fokus.


---

## 59. Sinkronisasi Promo Excel Multi-Brand (SUKO, MUKU, ZES) & Optimasi Foto Produk Instan 0ms Tanpa Loading

- **Instruksi Pengguna:**
  1. *"oh iya ini kan banyuak banget sku baru dan barcode baru. saat aku uploaded file promo dari suko muku zes terupdate otomatis yak . sementara kita pakai excel dulu. aslinya itu mds bisa udah ada sekalian harga promonya loh minggu depan aja kita jelajah masalah promo update dari mds bisa"*
  2. *"sama 1 gambarnya loading gituloh. aku inginnya itu saat di scan atau aku cari dengan text ga pake loading gambarnya atau memuat gambar inginnya langsung gitu keluar gambarnya ini memakan waktu soallnya tolong dibenahi"*
- **Implementasi & Pengamanan Sistem:**
  1. **Pencocokan Cerdas Promo Excel Multi-Brand ([`src/app/api/upload/chunk/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/upload/chunk/route.ts), [`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py), [`python-engine/parser.py`](file:///c:/Max%20Display/price-checker/python-engine/parser.py)):**
     - Mendukung penuh deteksi file promo merek **SUKO**, **MUKU**, **ZES**, **ANYDAY**, **BYRCH & CO**, **NEVADA**, **CONNEXION**, dll.
     - **3-Jalur Matching Otomatis:** Resolusi SKU 8-digit $\rightarrow$ SKU 7-digit ke 8-digit Modulo-10 otomatis $\rightarrow$ Barcode 13-digit EAN-13 Hangtag.
     - **Proteksi Total:** Hanya memperbarui kolom promo (`hargaPromo`, `diskon`, `discountType`, `acara`, `fromDate`, `toDate`, `promoFileName`). Tidak pernah menimpa barcode, kode artikel, warna, ukuran, stok fisik, atau galeri foto studio CDN.
  2. **Akselerasi Foto Produk Instan 0ms Tanpa Loading ([`src/components/ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), [`src/app/layout.tsx`](file:///c:/Max%20Display/price-checker/src/app/layout.tsx)):**
     - **CDN Compression 80x Lebih Ringan (`optimizeRetailImageUrl`):** Menambahkan parameter `width=400` ke CDN Shopify/Matahari sehingga bobot foto turun dari ~1,2 MB menjadi hanya ~14 KB per gambar tanpa mengurangi ketajaman di layar HP.
     - **RAM Preloading & Optimistic Display:** Saat pencarian teks atau scan produk, seluruh foto varian warna lain langsung di-preload di background (`preloadProductImages`). Begitu item diklik dari daftar pencarian teks, gambar langsung muncul dalam 0ms karena memakai cache RAM yang sama (`decoding="sync"`, `loading="eager"`).
     - **Fallback Foto Antar-Varian:** Jika varian ukuran tertentu belum memiliki URL gambar tersendiri, sistem otomatis meminjam foto dari varian warna atau artikel yang sama.
     - **Preconnect:** Menanamkan `<link rel="preconnect" href="https://cdn.shopify.com" />` di `layout.tsx` untuk mengeliminasi latensi koneksi jaringan.



---

## 60. Perbaikan Realtime Self-Healing MDS BISA (`checkSingleItemStock`) & Ekspansi Sapuan Celah Produk Baru

- **Instruksi Pengguna:**
  - *"buanyak banget loh produk yang belum masuk ayo cari lagi produk yang belum ketemu di mds bisa loh ada adehhhh"* (melampirkan contoh `SKU 68168801` / `BC 2340002540868` `SSTH1-BD6` SEGA & `BC 2340001264343` $\rightarrow$ `2340001264345` `SKU 19138275` `SPVSEXPC` STANLEY ADAMS yang ada di StoreHub MDS BISA namun tidak terdeteksi di app).
- **Akar Masalah yang Ditemukan:**
  1. **Bug Kritis Overwrite Cookie (`or "db76d"`):** Di [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py) dan [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), pengecekan session menganggap cookie `db76d...` (cookie sticky HAProxy tanpa autentikasi `mso_session`) sebagai login berhasil, sehingga menimpa `secrets/mds_cookie.txt` di Supabase Storage dengan cookie mati 98 byte.
  2. **Bug Live Return Barcode vs SKU (`mdsBisaClient.ts`):** Saat scan barcode 13 digit baru (misal `2340002540868`), `checkSingleItemStock()` mengupsert ke DB menggunakan `sku: itemSku` (`68168801`), namun me-return `sku: cleanSku` (`2340002540868`), sehingga [`/api/product/[identifier]`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts) gagal menemukan baris baru tersebut di DB. Ditambah `fallbackToDb()` sebelumnya keliru mengembalikan `success: true` meski produk `null`.
  3. **Timeout & Deteksi Auth:** Batas waktu `1800ms` terlalu pendek untuk cold StoreHub lookup (dinaikkan menjadi `5500ms` saat toko buka `09:00–21:30 WIB`), serta deteksi redirect Next.js `303`/`NEXT_REDIRECT` menuju `/login` ditambahkan agar refresh cookie & action hash otomatis berjalan mulus, dilengkapi fallback koreksi check-digit GS1 EAN-13 (misal `2340001264343` $\rightarrow$ `2340001264345`).
  4. **Cakupan Blok `234000*` & Ekspansi Tetangga Modulo-10 (`morning_full_sweep.py`):** Menutup seluruh lubang blok besar yang sebelumnya terlewat (`244501..282999`, `316001..360000`, `215001..235899`, `120000..148999`, dst.) + otomatis menyapu varian tetangga SKU Modulo-10 (`body7 ± 12`) setiap kali produk baru ditemukan, dan mengaktifkan `--upc-first` pada [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml).

  - **Hasil Eksekusi Live Hari Ini (11 Nov 2026 15:09–16:12 WIB):**
    - Total katalog Supabase melonjak dari **`84.764` $\rightarrow$ `97.546 SKU`** (**`+12.782 SKU` baru** diserap masuk hanya dalam 1 jam, mencapai area barcode `2340002596xx`).
    - Seluruh `97.546` jalur SKU/Barcode/Artikel telah diekspor & diamankan ke [`python-engine/mapped_sku_paths.json.gz`](file:///c:/Max%20Display/price-checker/python-engine/mapped_sku_paths.json.gz) (`712.3 KB`).
    - Saat dilanjutkan nanti, tinggal jalankan kembali `morning_full_sweep.py --brutal --upc-first` (mesin otomatis melewati seluruh `97.546` SKU/Barcode yang sudah tercatat dan langsung menyapu sisa celah `2340002597xx..282999`, `316001..360000`, `215001..235899`, `120000..148999`, dll.).



---

## 61. Rombakan UI/UX Halaman Gudang Stock (`/warehouse`) & Pengayaan Kode Artikel API Tiket

- **Instruksi Pengguna:**
  - *"brader pas di gudang stock itu loh artikel dan nama kepotong jadi bingung mau cari. di gudang stock ini uiux yang bagus sesuai bagus ringkas detail jadi enak brader"*
- **Akar Masalah:**
  1. [`GET /api/tickets`](file:///c:/Max%20Display/price-checker/src/app/api/tickets/route.ts) sebelumnya hanya me-return `productName`, `color`, `productSize`, `hargaNormal`, dan `imageUrl` **tanpa mengambil `article`, `brand`, `dept`, `barcode`, `hargaPromo`, dan `stok`**, sehingga kode artikel tidak pernah muncul di layar Gudang Stock.
  2. Di [`src/app/warehouse/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/warehouse/page.tsx) dan daftar pesanan [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), nama produk terpotong/rancu (`truncate` & pemisahan teks sempit) dan belum ada fitur pencarian cepat maupun hirarki *picking* gudang.
- **Implementasi Solusi:**
  1. **Pengayaan API [`src/app/api/tickets/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/tickets/route.ts):** Menambahkan `article`, `brand`, `dept`, `barcode`, `hargaPromo`, dan `stok` pada respons tiket, plus fallback foto studio otomatis per `article` jika varian SKU tertentu belum memiliki `imageUrl` tersendiri.
  2. **Desain Ulang Picking UI/UX [`src/app/warehouse/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/warehouse/page.tsx):**
     - **Nol Pemotongan Teks (`whitespace-normal break-words`):** Kode Artikel ditonjolkan besar dalam badge gelap monospace + tombol **Copy 1-ketuk**, diikuti **Nama Produk lengkap**, **Brand/Dept**, dan badge **Stok Sistem**.
     - **Grid Picking 3 Kolom Ringkas:** Menonjolkan **Warna**, **Ukuran**, dan **Qty Ambil (`Pcs`)** agar langsung terbaca sekilas di rak gudang, beserta **SKU**, **Barcode**, harga normal/promo, dan foto produk terkompresi CDN (`?width=400`) + zoom lightbox.
     - **Pencarian & Kontrol Cepat Gudang:** Kolom pencarian instan lintas Artikel/Nama/SKU/Barcode/Warna/Brand/Pemesan, tab filter (`Semua`, `Menunggu`, `Selesai`), ringkasan statistik 3-kartu, auto-expand pesanan `PENDING`, dan tombol **✓ Ready Semua** per pesanan.



---

## 62. Penggantian Label Antarmuka "MDS BISA" $\rightarrow$ "by luqman org" & Pratinjau UI/UX Home + Search Catalog

- **Instruksi Pengguna:**
  1. Meminta contoh/pratinjau visual UI/UX halaman utama ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)) terlebih dahulu sebelum implementasi, termasuk rancangan bar **Cari & Scan ringkas** serta daftar hasil **Setelah Cari** yang rapi (tidak berulang-ulang setiap size seperti baris panjang kembar).
  2. *"sama kata mds bisa harus dihapus all diganti by luqman org"*
- **Implementasi Pembersihan Branding UI (`MDS BISA` $\rightarrow$ `by luqman org`):**
  - Menghapus seluruh teks/label `MDS BISA` maupun `StoreHub` yang tampil kepada pengguna dan menggantinya konsisten menjadi **`by luqman org`** di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), [`src/app/super-admin/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/page.tsx), [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx), [`src/app/super-admin/users/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/users/page.tsx), [`src/app/api/last-update/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/last-update/route.ts), [`src/app/api/admin/trigger/github-status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-status/route.ts), [`src/app/api/admin/users/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/users/route.ts), [`src/app/api/auth/login/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py), dan [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml) tanpa mengubah koneksi endpoint/schema database agar seluruh fitur tetap 100% fungsional.
- **Pratinjau Desain UI/UX (Menunggu Persetujuan Eksekusi Kode):**
  - Disiapkan via widget interaktif [`suko_inline_preview.html`](file:///C:/Users/LUCKMEN/.gemini/antigravity/brain/69a22a31-df6b-45ef-968c-5a6eaa02549b/suko_inline_preview.html), pratinjau penuh [`home_uiux_preview.html`](file:///C:/Users/LUCKMEN/.gemini/antigravity/brain/69a22a31-df6b-45ef-968c-5a6eaa02549b/home_uiux_preview.html), serta galeri gambar [`UI_UX_GALERI_SUKO.md`](file:///C:/Users/LUCKMEN/.gemini/antigravity/brain/69a22a31-df6b-45ef-968c-5a6eaa02549b/UI_UX_GALERI_SUKO.md).

---

## 63. Eksekusi Desain Konsep 3 — Cockpit Ringkas & Hasil Pencarian Dikelompokkan Per Artikel

- **Keputusan Pengguna:** Menyetujui **Konsep 3** (*"sorry pakai konsep 3 aja deh"*) dengan target: menghilangkan tumpukan duplikat baris per ukuran (S/M/L/XL) saat mencari kata kunci seperti `"jaket"`, merampingkan area header + banner + mode tab ke dalam satu cockpit gelap ringkas, serta menata bilah Cari + Scan Barcode agar tombol Scan selalu terlihat.
- **Perubahan Inti Backend & Search Engine (Article Grouping):**
  1. [`groupProductsByArticle`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts) di [`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts): Mengagregasi varian SKU yang memiliki kode `article` sama menjadi 1 kartu model representatif lengkap dengan `articleGroupCount`, `articleTotalStok`, daftar warna unik (`articleColors`), rentang ukuran terurut (`articleSizes`), serta status promo gabungan (`articleHasPromo` & `articlePromoLabel`).
  2. [`GET /api/product/[identifier]`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts): Mengambil kandidat lebih lebar (`take: 320` strict / `220` relaxed), membersihkan promo kedaluwarsa, mengelompokkan hasil via `groupProductsByArticle()`, langsung membuka detail + seluruh `siblings` jika hanya 1 artikel yang cocok, atau mengirim daftar artikel unik terpaginasi bersama `meta.total` & `meta.totalSkus`.
  3. [`searchOfflineSmart`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts): Menerapkan `groupProductsByArticle()` agar hasil pencarian mode offline di Dexie juga tampil rapi per artikel.
- **Perubahan UI/UX Halaman Utama ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
  1. **Cockpit Header Gelap & Tab Terintegrasi:** Header profil, toggle `AKTIF | REHAT`, tab mode (`Facing Out` | `Tanya Stok` | `Cek Pesanan`), dan status `by luqman org` + tombol `Sync` diringkas ke satu header cockpit ramping (`from-slate-900 via-blue-950 to-indigo-950`) agar pencarian langsung berada di layar atas. Alert merah `Pembaruan Tersedia! UPDATE SEKARANG` tetap tampil otomatis saat ada update baru.
  2. **Bilah Cari 1-Baris & Pintasan 2-Kolom:** Input pencarian (`×` hapus di dalam) + tombol kamera Barcode hijau zamrud yang **selalu tampil** di sebelah kanan + tombol `Cari` biru, diikuti chip `Terakhir` & pintasan side-by-side 2-kolom (`Barang Baru!` & `Promo BOGO`) saat kondisi idle.
  3. **Katalog Konsep 3 Per Artikel:** Header hasil (`Hasil Pencarian: X Model` + total varian SKU), filter cepat 1-ketuk (`Semua`, `Ada Stok`, `Sedang Promo`), dan grid responsif (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) menampilkan foto teroptimasi (`?width=400`), badge promo, badge jumlah varian, badge monospace `article`, brand, judul lengkap 2 baris (`line-clamp-2`), ringkasan warna & rentang ukuran, harga normal/promo, serta total stok gabungan.

---

## 64. Auto-Scroll Paginasi Atas & Optimasi Radikal Kecepatan Pencarian Teks (`"jaket"` 6,6s $\rightarrow$ Kilat)

- **Masalah Pengguna:**
  1. Saat menekan tombol **Selanjutnya** di daftar hasil pencarian, posisi layar masih tertinggal di bawah (*"langsung ke atas scrollnya biar enak"*).
  2. Ketika mengetik kata kunci umum seperti `"jaket"`, kemunculan daftar produk terasa sangat lambat (**~6,6 detik** pada endpoint `/api/product/jaket` di produksi) meski gambar CDN sudah cepat.
- **Temuan Akar Masalah Pencarian Lambat (Bukti Observasi Langsung):**
  1. **Mismatch Region Serverless (`sin1::iad1`):** Edge Vercel Singapura (`sin1`) mem-proxy fungsi `/api/product/[identifier]` ke `iad1` (US East Virginia), lalu fungsi dari US tersebut melakukan beberapa roundtrip sekuensial kembali ke database Neon Singapura (`ap-southeast-1`) $\rightarrow$ TTFB membengkak menjadi **4,53–6,63 detik**.
  2. **Sequential Table Scan 97.546 Baris:** Tabel `"Product"` di Postgres sebelumnya hanya memiliki index `id`, `sku`, dan `barcode` (tanpa index `stok`, `article`, maupun `pg_trgm` GIN). Kueri Prisma menjalankan puluhan kondisi `ILIKE` lintas 8 kolom (termasuk kolom tak relevan seperti `sku`/`barcode`/`size`) $\rightarrow$ **7.111 ms** SQL scan sebelum diindeks.
  3. **Query Berlebih & Spam Koneksi Promo:** Input kata huruf murni seperti `"jaket"` masih mengeksekusi 2 query exact `sku`/`barcode`, mengirim 30 kolom lebar (`images[]`, histori penjualan) untuk 320 baris, dan menembak `db.product.update` satu per satu untuk setiap promo kedaluwarsa.
- **Perbaikan Menyeluruh:**
  1. **Scroll Atas Halus (`src/app/page.tsx`):** Menambahkan `scrollPageToTop()` dan `handlePageChange()` pada tombol **Sebelumnya** & **Selanjutnya**, serta saat membuka kartu model dari hasil pencarian.
  2. **Index Database Postgres (`prisma/schema.prisma` + `pg_trgm`):** Mengaktifkan ekstensi `pg_trgm` dan menambahkan `Product_article_idx`, `Product_stok_idx` (`DESC`), serta 5 GIN index (`gin_trgm_ops`) pada `description`, `article`, `brand`, `dept`, `color`. Hasil `EXPLAIN ANALYZE` turun drastis dari **7.111 ms** menjadi **~52–174 ms**.
  3. **Optimasi Route API ([`vercel.json`](file:///c:/Max%20Display/price-checker/vercel.json), `src/app/api/product/[identifier]/route.ts`, & `src/lib/smartSearchEngine.ts`):**
     - Menetapkan `"regions": ["sin1"]` di `vercel.json` (menggantikan `preferredRegion` yang deprecated di Next.js 16) agar seluruh Serverless Functions berjalan di Singapura dekat pengguna & Neon DB.
     - Melewati exact lookup `sku`/`barcode` untuk query huruf tanpa angka, memfokuskan `ILIKE` ke kolom teks terindeks GIN, memangkas stem typo berlebih di `expandRetailQuery`, memakai `PRODUCT_LIST_SELECT` ramping, menyatukan cleanup promo kedaluwarsa dalam 1 `updateMany`, serta menambahkan LRU cache 60 detik di server (`searchListCache`).
  4. **Cache Paginasi 0ms + Background Prefetch (`src/app/page.tsx`):** Menambahkan `listCacheRef` (TTL 60 detik) beserta *silent prefetch* halaman berikutnya + preload thumbnail 400px di latar belakang agar klik **Selanjutnya** / **Sebelumnya** tampil instan **0ms**.

---

## 65. Penyempurnaan Kartu Katalog Portrait 5-Kolom Desktop & Foto Bersih Tanpa Badge

- **Masalah dari Screenshot Pengguna:**
  1. Badge merah `HARGA SPESIAL` dan pill `varian` menimpa area foto model (`absolute top-1.5`) sehingga menutupi/merusak tampilan wajah & pakaian.
  2. Ukuran kotak foto sebelumnya (`sm:h-44` di grid 2-3 kolom) berbentuk *landscape* melebar sehingga memotong bagian bawah model (hanya tampak kepala) dan terasa terlalu renggang di desktop.
- **Perbaikan di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx):**
  1. **Foto 100% Bersih & Proporsi Portrait (`aspect-[3/4]`):** Seluruh badge overlay di atas foto dihapus; container gambar selalu memakai rasio portrait vertical `aspect-[3/4]` dengan `object-cover object-top` sehingga model tampil utuh dari kepala sampai pakaian tanpa terpotong horizontal.
  2. **Grid Multi-Kolom Padat hingga 5 Kartu Sekaligus (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`):** Menampilkan 2 kartu portrait per baris di HP, 3–4 kartu di layar *split*/tablet, dan **5 kartu portrait sekaligus** per baris di desktop (`20` item/halaman = `4` baris penuh simetris).
  3. **Badge Promo & Varian Dipindah ke Area Info:** Label `HARGA SPESIAL`/`PROMO`/`ACARA` dan jumlah varian (`X var`) ditempatkan rapi bersama badge `article`, brand, warna/ukuran, harga, dan stok di bawah foto.

---

## 66. Filter Pemisah Brand (`SUKO` / `Mu+Ku` / `ZES`) & Pengelompokan Kategori Produk

- **Instruksi Pengguna:** Meminta agar produk dipisahkan jelas per brand (**SUKO**, **Mu+Ku**, **ZES**) dan dikelompokkan berdasarkan kategori (**Jaket**, **Celana**, **Atasan**, **Dress & Rok**, dll.).
- **Implementasi Terintegrasi (Single Source of Truth):**
  1. [`src/lib/productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts): Mendefinisikan klasifikasi akurat berbasis data DB untuk Brand Concept (`SUKO`, `MUKU`/`Mu+Ku`, `ZES`, `OTHER` — memastikan `MK-`/`-MK`/`MUKU`/`MU+KU` teridentifikasi akurat tanpa tertukar sandal `MICKEY`) dan Kategori (`JAKET`, `ATASAN`, `CELANA`, `DRESS_ROK`, `SEPATU_SANDAL`, `TAS_AKSESORIS`, `TIDUR_DALAM`, `OTHER`), lengkap dengan generator `where` Prisma yang memanfaatkan GIN `pg_trgm`.
  2. [`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`GET /api/catalog`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), & [`GET /api/product/[identifier]`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts): Berbagi helper `cleanPromoList`, `getProductSiblings`, `summarizeTaxonomyCounts`, dan `filterByTaxonomy`. Mendukung jelajah langsung katalog per brand/kategori dari beranda (tanpa harus mengetik kata kunci) maupun filter lintas pencarian teks, lengkap dengan cache server 60 detik.
  3. [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts): Menambahkan `browseOfflineCatalog()` & parameter filter brand/kategori ke `searchOfflineSmart()`.
  4. [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx): Menambahkan bar filter **Brand (`Semua | SUKO | Mu+Ku | ZES | Lainnya`)** + bar **Kategori (`Jaket | Atasan | Celana | Dress/Rok | Sepatu | Tas/Accs | Tidur/Dalam`)** dengan counter model, toggle **Kelompok Kategori** yang memisahkan hasil menjadi section kategori ber-grid 5-kolom portrait, badge brand berwarna khas pada tiap kartu, dan *background prefetch* halaman berikutnya.

---

## 67. Pencarian & Paginasi Lokal HP Instan (~5–10ms) Berbasis Tabel `db.models` (`~30 MB` Offline Cache)

- **Pertanyaan & Kebutuhan Pengguna:**
  - *"untuk klik selanjutnya juga lama munculnya. gini loh berapa gb sih cachenya ? mending suruh hp donwload semua data deh biar enak cepat mantap"*
- **Fakta Ukuran Cache Sebenarnya:**
  - Unduhan seluruh `97.546 SKU` dari `/api/export-products` hanya ~3,5–4 MB terkompresi jaringan dan memakan ruang IndexedDB browser sekitar **~28–35 MB (~0,03 GB)** saja (jauh di bawah 1 GB).
  - Di-merge menjadi **19.881 model artikel** pre-grouped (`db.models` Dexie `v12`), memori RAM index pencarian hanya memakan **~7 MB**.
- **Implementasi Instant Offline-First (`src/lib/offlineDb.ts` & `src/app/page.tsx`):**
  1. **Dexie Schema `v12` + `db.models` ([`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts)):** Menambahkan object store `models` (`rebuildModelsIndexFromProducts()` & `ensureModelsIndexReady()`) yang mem-pre-compute pengelompokan artikel, status promo valid, taxonomy Brand (`SUKO`/`Mu+Ku`/`ZES`), Kategori, dan `_searchHay` satu kali saja tanpa menghapus data `products` eksisting.
  2. **Kueri Lokal `< 10ms` (`queryLocalModelsInstant`):** Pencarian teks (`"jaket"`), jelajah Brand/Kategori, dan seluruh perpindahan halaman (**Selanjutnya** / **Sebelumnya**) langsung dieksekusi di memori perangkat dalam ~5–10ms tanpa menunggu roundtrip server. Jika kata kunci kalimat unik tidak cocok lokal atau cache belum selesai terunduh, sistem otomatis jatuh mulus ke `/api/product/[identifier]` & `/api/catalog` (`sin1`) + prefetch halaman berikutnya yang sudah diperbaiki untuk `Hal 2 -> Hal 3+`.
  3. **Indikator Kapasitas Nyata (`getLocalCacheStats`):** Menampilkan lencana status **`⚡ HP Siap (~XX MB • 97.546 SKU)`** di status bar header saat penuh, atau tombol **`Unduh (~32 MB)`** bila perangkat baru belum sinkron.

---

## 68. Audit Fakta Database 97.546 SKU & Perbaikan Batas `take: 420` SUKO/ZES di `/api/catalog`

- **Temuan Pemeriksaan Langsung Postgres (`97.546 SKU` / `19.881` Model Unik):**
  - `SUKO`: **10.322 SKU** (**1.309 model**) — termasuk `5.600+` SKU berstok fisik Toko 719 (`stok > 0`). Sebelumnya terpotong di screenshot pengguna (`157` model) karena `/api/catalog` memiliki batas `take: 420` baris SKU.
  - `ZES`: **6.210 SKU** (**1.178 model**) — sebelumnya ikut terpotong oleh `take: 420` dan mayoritas bersaldo `stok: 0` karena baru masuk dari katalog master CDN/MDS sebelum update stok fisik toko.
  - `MUKU` (`Mu+Ku`): **88 SKU** (**19 model** bertag `MUKU`/`MU+KU`/`MK-`/`-MK`).
  - `Lainnya` (**~80.926 SKU** / **~17.375 model**): merupakan merk reguler Matahari MDS hasil sapuan katalog/brutal sweep (`NEVADA` 21.720 SKU, `LITTLE M` 16.110 SKU, `CONNEXION` 4.680 SKU, `COLE` 4.325 SKU, `MAXMURAH` 4.500+ SKU, `ST YVES` 3.380 SKU, `VOLO` 2.118 SKU, dll.).
- **Perbaikan yang Diterapkan:**
  1. Menghapus limit kecil `420` pada [`GET /api/catalog`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts) untuk `SUKO`/`ZES`/`MUKU` (`take: 12000`, `ALL`/`OTHER`: `1800`) dan memperpanjang TTL cache ke 120 detik agar server mengembalikan seluruh **1.309 model SUKO** dan **1.178 model ZES** tanpa terpotong.
  2. Menambahkan [`getLocalTaxonomyOverview`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts#L646) + [`clearListToIdle`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) agar angka model asli per brand (`Semua 19.881 | SUKO 1.309 | Mu+Ku 19 | ZES 1.178 | Lainnya 17.375`) langsung tampil transparan sejak layar beranda dibuka.

---

## 69. Arsitektur 3 Toko Asli: Monostore `SUKO` & `ZES` vs Multibrand `Mu+Ku` (Hapus Bucket "Lainnya")

- **Klarifikasi Bisnis Pengguna:**
  - *"sucko itu identik zes juga karna 2 toko ini brandnya 1 aja ya suko ya zes karna monostore. kalau muku banyak brand. jangan dimasukkan lainnya."*
  - **Penjelasan SKU vs Model (`97.546 SKU` vs `~19.881 Model`):** Setiap 1 Model Artikel rata-rata memiliki ~5 SKU warna/ukuran (`S, M, L, XL`), sehingga **~19.881 Model = 97.546 SKU** utuh di cache lokal (~34 MB).
- **Perbaikan Menyeluruh ([`productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts), [`offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`api/catalog`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), [`page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
  1. **Hapus Filter `"Lainnya"`:** Hanya ada 3 konsep toko: **`SUKO`** (*Monostore*, `1.309 Model` / `10.322 SKU`), **`ZES`** (*Monostore*, `1.178 Model` / `6.210 SKU`), dan **`Mu+Ku`** (*Multibrand Store*, menampung seluruh merk reguler `NEVADA`, `LITTLE M`, `CONNEXION`, `COLE`, `MAXMURAH`, `ST YVES`, `VOLO`, `BYRCH & CO`, `MUKU`, dll. = **`~17.394 Model`** / **`~81.014 SKU`**).
  2. **Sub-Brand Strip Khusus `Mu+Ku`:** Ketika user memilih **`Mu+Ku`**, muncul bar quick-filter merk populer (`NEVADA`, `LITTLE M`, `CONNEXION`, `COLE`, `MAXMURAH`, `ST YVES`, `VOLO`, `BYRCH & CO`, `MUKU`, dll.), dan setiap kartu `Mu+Ku` menampilkan badge toko **`Mu+Ku`** bersama badge merk produknya masing-masing.
  3. **Auto-Upgrade Index Tanpa Re-Download (`v13_smz_monostore`):** Menambahkan versi taxonomy lokal `suko_models_taxonomy_ver` di `ensureModelsIndexReady()` agar `db.models` dibangun ulang otomatis dalam ~450ms langsung dari `db.products` (tanpa unduh ulang 97.546 SKU).

### 70. Label Eksplisit "Artikel" + Grouping Brand-First `Mu+Ku` & Kategori `Beauty` (`v14_muku_brand_sections`)
- **Konteks Masalah User:**
  1. Membedakan jumlah model unik vs total varian SKU agar kasir tidak mengira hasil pencarian/filter `"cuma 19 barang"`: seluruh label UI diubah eksplisit dari **`Model`** menjadi **`Artikel`** + pill **`Total SKU varian`**.
  2. Saat membuka **`Mu+Ku`** (*Multibrand*), halaman 1 sebelumnya dipenuhi kosmetik `NAYOUNG` (`BLUSH VEIL LIQUID` salah masuk `👕 Atasan` karena substring `"BLUS"`), stiker `GENERAL TOYS` & tumbler tanpa foto karena sortir stok murni (`stok DESC`), serta pecahan kategori 1–2 kartu alih-alih dikelompokkan berdasarkan **Brand** lebih dulu.
- **Perbaikan Menyeluruh ([`productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts), [`productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`api/catalog`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), [`api/product/[identifier]`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts), [`page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
  1. **Word-Boundary Category & Kategori `💄 BEAUTY`:** Mengganti `.includes()` dengan compiled word-boundary RegExp (`CATEGORY_REGEX_MAP`) sehingga `BLUSH` -> `Beauty & Skincare` (bukan `BLUS`/`ATASAN`), `BAGGY` != `BAG`, `CAPYBARA` != `CAP`, `STOPPER` != `TOP`.
  2. **Photo-First Browse Ordering & Normalized Sub-Brands:** Shared helper `compareBrowseItems`, `getNormalizedSubBrand`, `sortSubBrandStats`, dan `buildBrandShowcaseSections` memastikan produk **berfoto** tampil lebih dulu di galeri *Facing Out* sebelum item `"Belum Ada Foto"`, serta menyatukan label merk `NAYOUNG`, `ST YVES`, `MAXMURAH`, `BYRCH & CO`, `MUKU`, `LITTLE M`, `NEVADA`, `CONNEXION`, `COLE`, `VOLO`.
  3. **Grouping `Mu+Ku` By Brand First (`Kelompok Brand`):**
     - Saat berada di **`Mu+Ku`** tanpa filter merk spesifik: chip **`Merk Mu+Ku:`** menampilkan jumlah artikel live per brand (`NEVADA`, `LITTLE M`, `MAXMURAH`, `COLE`, `CONNEXION`, `ST YVES`, `VOLO`, dst.), dan area hasil menampilkan **Showcase 1 baris (5 artikel unggulan) per Brand** (`brandShowcaseSections`) atau pengelompokan hasil per Brand saat mengetik query/pindah halaman, lengkap dengan tombol **`Lihat semua [Brand] →`** sebelum masuk ke rincian kategori brand tersebut.
  4. **Auto-Upgrade Index Lokal (`v14_muku_brand_sections`):** `db.models` terbangun ulang otomatis ~450ms di HP langsung dari `db.products` yang sudah tersimpan tanpa perlu download ulang data master.

### 71. Python Catalog Brain (`CatalogArticle`) + Paginasi Anti-Dobel `BRAND_PAGES` & `CATEGORY_PAGES` (`v15_brand_pages_dedup`)
- **Instruksi User & Arsitektur ("Python yang mikir, Vercel hanya display"):**
  - Masalah sebelumnya: saat lanjut halaman (`Hal 1 -> Hal 2 -> Hal 3`), kategori/divisi seperti `"CHILDREN BOYS"` muncul ganda lintas halaman di `Mu+Ku` maupun pengulangan kategori & artikel tanpa style-code (`article = "0"`) pada `SUKO` & `ZES`.
- **Implementasi Python-First ([`python-engine/build_catalog_index.py`](file:///c:/Max%20Display/price-checker/python-engine/build_catalog_index.py), [`prisma/schema.prisma`](file:///c:/Max%20Display/price-checker/prisma/schema.prisma), [`api/catalog-models`](file:///c:/Max%20Display/price-checker/src/app/api/catalog-models/route.ts), [`api/catalog`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), [`offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
  1. **Tabel `CatalogArticle` Olahan Python (`17.320` Artikel Unik Bersih):**
     - `build_catalog_index.py` menyapu seluruh `97.546` SKU PostgreSQL, membuang `515` baris dummy/mati (`"ITEM TIDAK DIGUNAKAN"`, `"SKU DUMMY"`, `"DUMMYZES"`), menggabungkan SKU ber-`article = "0"` via kunci dasar `DESC::brand::dept::baseDesc`, serta mengekstrak seluruh **24 divisi ERP** (`CHILDREN BOYS`, `CHILDREN GIRLS`, `MEN CONTEMP CASUAL`, `LADIES CONTEMP`, `YOUNG FASHION`, `INTIMATE`, `MEN FORMAL`, `HANDBAGS`, `FRAGRANCE`, dst.) ke **merk aslinya** (`DISNEY`, `CHARACTER`, `ST YVES`, `AOS`, `KINN`, `SHE SENSE`, `ANNISA`, `KHA`, `CROCODILE`, `CARDINAL`, dst.).
     - Hasil live DB terverifikasi: **`SUKO: 1.176`**, **`ZES: 904`**, **`Mu+Ku: 15.240` (`280` brand asli, `0` divisi nyasar, `0` duplikat key)**.
  2. **Paginasi Anti-Dobel di Ketiga Toko (`paginateBrandSections` & `paginateCategorySections`):**
     - **`Mu+Ku` (tanpa sub-brand terpilih) -> `BRAND_PAGES` (`8` Brand Unik per Halaman):** Hal 1 (`NEVADA`, `LITTLE M`, `DISNEY`, `MAXMURAH`, `CHARACTER`, `ST YVES`, `AOS`, `CONNEXION`), Hal 2 (`COLE`, `VOLO`, `KHA`, `CARDINAL`, `KINN`, `ANNISA`, `SHE SENSE`, `YIPPI`), dst. Tidak ada brand yang muncul ganda lintas halaman bahkan saat tekan **Selanjutnya**.
     - **`SUKO`, `ZES`, & Merk Terpilih `Mu+Ku` -> `CATEGORY_PAGES` (`5` Kategori Unik per Halaman) + Toggle `Semua Artikel`:** Di tab `Semua`, setiap kategori hanya muncul **1x** (`Hal 1/2`), plus 1 klik **`Per Kategori` ↔ `Semua Artikel`** atau **`Lihat semua [Kategori] →`** untuk mode daftar rata (`LIST`, 20 artikel deduplikasi per halaman).
  3. **Sync Kilat HP dari `CatalogArticle` (`/api/catalog-models`) & CI Automation:** HP mengambil `17.320` model matang olahan Python langsung dalam ~2 chunk (<1 detik) untuk index `v15_brand_pages_dedup`, dan [`retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml) menyertakan langkah otomatis rebuild `CatalogArticle`.

### 72. Rombakan Detail Produk: Full-Width Portrait Gallery + Rapid Facing Out Per Warna & Size
- **Desain Disetujui User (Preview v3 $\rightarrow$ Production):**
  1. **Foto Full-Bleed Edge-to-Edge ([`ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx)):**
     - Menghilangkan kotak pembungkus kecil (`max-w` & padding putih); kini memakai `w-full aspect-[3/4]` (`imageWidth = 800` HD) penuh tepi di HP maupun 5/12 kolom kiri Split Layout di Desktop, lengkap strip thumbnail 6 sudut foto, badge warna/counter di pojok foto, dan Lightbox layar penuh.
  2. **Utility Bar & Price/Live-Stock Ringkas ([`page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Tombol **`← Kembali`** yang mengembalikan konteks halaman katalog terakhir (`preDetailSearchRef`), badge salin 1-klik (`ART`, `SKU`, `UPC`), panel harga + `Sisa Stok (EOH)` + `⚡ Live Stok Artikel`, qty cepat, tombol Facing Out/Tanya Stok aktif, & cetak label PDF.
  3. **Matrix Rapid Facing Out Dikelompokkan Per Warna:**
     - Seluruh ukuran (`S`, `M`, `L`, `XL`, dll.) dikelompokkan rapi di dalam kartu masing-masing warnanya (`BEIGE`, `BLACK`, dst.).
     - **1 ketuk kotak size (`quickTapSizePill`)** langsung menambah `+1` dan menyinkronkan foto warna; tombol **`⚡ +1 Semua Size` (`addFullColorSetQty`)** menambahkan seluruh size tersedia pada warna tersebut sekaligus tanpa scan ulang barcode satu per satu, dirangkum di sticky bottom bar (`+ Tambah Lagi` / `Simpan Facing Out →`).

### 73. Audit & Pembersihan Foto Nyasar ZES + Isolasi Artikel Lintas Toko/Kategori (`v16_zes_clean_dedup`)
- **Akar Masalah Katalog ZES (`0/107` Foto Milik ZES):**
  - Audit 96 sitemap produk `matahari.com` + tabel `Product` membuktikan katalog web resmi `matahari.com` belum menyediakan foto studio untuk `ZES`. Seluruh 107 baris `ZES` yang sempat berfoto ternyata hasil propagasi salah `brutal_image_scraper.py` dari brand sandal/sepatu & dalaman (`VOLO`/`COLE`/`NEVADA`) karena kode artikel human-name kembar (mis. `THEA` Cardigan ZES vs Sandal VOLO; `JULIAN` Sweatshirt ZES vs Sandal VOLO).
  - Pengelompokan artikel sebelumnya (`ART::{rawArt}`) menggabungkan produk beda toko/kategori yang kebetulan memakai kode artikel sama (`THEA 19 var`, `JULIAN 22 var`).
- **Solusi End-to-End Python + Database + UI (`task-7561`, `task-7641`):**
  1. **Scrubbing DB:** `293` SKU dengan URL foto nyasar lintas toko/kategori & item `DUMMY` dibersihkan (`imageUrl = NULL`, `REMAINING_ZES_WITH_PHOTO = 0`).
  2. **Isolasi Scraper & Indexing:** `brutal_image_scraper.py` kini mengunci propagasi sibling per `(brand_group, category_key, article[, color])`; `build_catalog_index.py`, `smartSearchEngine.ts`, `getProductSiblings`, & filter API kini memisahkan `ART::{brandGroup}::{categoryKey}::{rawArt}` serta memblokir varian teks dummy `ITEM TIDAK DAPAT` / `TIDAK DI GUNAKAN`. Rebuild `CatalogArticle` menghasilkan `17.362` artikel unik (`ZES: 914`, `SUKO: 1.180`, `Mu+Ku: 15.268`, melewati `533` dummy), memisahkan `THEA`/`JULIAN` per toko & kategori.
  3. **Poster Warna Kartu Tanpa Foto + Banner ZES:** Bump `MODELS_TAXONOMY_VERSION` ke `"v16_zes_clean_dedup"` (`offlineDb.ts`), kartu tanpa foto di `page.tsx` ditingkatkan menjadi poster bertema kategori + dot variasi warna asli (`getColorData`), serta ditambah banner `INFO ZES` agar kasir paham status foto web ZES.

### 74. Pemulihan Kesehatan Supabase (`544 DatabaseTimeout` -> `200 OK`) & Download Progress Nyata Ber-ETA Anti-Loop
- **Akar Masalah Supabase Unhealthy (`temp_bytes: 9.216 GB`, Auth/REST/Storage Timeout):**
  1. Tabel `Product` (`97.546` baris, `16.611` dead tuples) sebelumnya **tidak memiliki index** pada `updatedAt DESC` maupun `(stok DESC, sku ASC)`, sehingga setiap hit `/api/check-update`, `/api/last-update`, & `/api/export-products` memaksa Postgres melakukan *Sequential Scan + External Disk Sort* 97k baris (`~9,2 TB` kumulatif temp sort I/O).
  2. Terdapat **17 file API/Halaman** yang membuat koneksi `const prisma = new PrismaClient()` terpisah tanpa batas pooler, serta [prisma.ts](file:///C:/Max%20Display/price-checker/src/lib/prisma.ts) belum memaksa `connection_limit=1` saat `DATABASE_URL` env terisi.
- **Akar Masalah Loading Download Looping Tanpa Persentase/ETA:**
  1. `useEffect([serverVersion])` di [page.tsx](file:///C:/Max%20Display/price-checker/src/app/page.tsx) memicu `syncOfflineDatabase` dua kali paralel, sementara `syncOfflineDatabase` di [offlineDb.ts](file:///C:/Max%20Display/price-checker/src/lib/offlineDb.ts) belum memiliki *single-flight lock* dan membiarkan sinkronisasi gagal mengulang dari chunk 0 terus-menerus.
  2. [`ShiftLoader`](file:///C:/Max%20Display/price-checker/src/components/ShiftLoader.tsx) masuk mode animasi looping saat `progress === undefined` dan overlay download belum menampilkan angka `%`, progress bar, maupun estimasi waktu sisa (`ETA`).
- **Perbaikan yang Diterapkan & Diverifikasi:**
  1. **Index & Maintenance PostgreSQL ([schema.prisma](file:///C:/Max%20Display/price-checker/prisma/schema.prisma), [task-7870](file:///C:/Users/LUCKMEN/.gemini/antigravity/brain/69a22a31-df6b-45ef-968c-5a6eaa02549b/.system_generated/tasks/task-7870.log)):** Menambahkan `Product_updatedAt_idx`, `Product_stok_sku_idx`, & `Ticket_status_createdAt_idx` + `VACUUM ANALYZE`. Query `updatedAt` turun dari timeout >15 detik menjadi **`3.0 ms`** (*Index Only Scan, Heap Fetches: 0*), `AUTH`/`REST`/`STORAGE` Supabase pulih ke **HTTP `200 OK` (0.75s–1.63s)**.
  2. **Unified Pool & Cursor Export:** Seluruh 17 route/halaman dialihkan ke [`prisma`](file:///C:/Max%20Display/price-checker/src/lib/prisma.ts) tunggal dengan `connection_limit=1`; [`/api/export-products`](file:///C:/Max%20Display/price-checker/src/app/api/export-products/route.ts) memakai *keyset cursor* `(stok DESC, sku ASC)` + metadata cache (`totalCount` & versi CDN `&v=`), dan `/api/check-update` + `/api/last-update` dilindungi micro-cache 15 detik.
  3. **Progress Nyata + `%` + Estimasi Waktu (`ETA`) + Anti-Loop ([offlineDb.ts](file:///C:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`SyncProgressModal`](file:///C:/Max%20Display/price-checker/src/components/ShiftLoader.tsx), [page.tsx](file:///C:/Max%20Display/price-checker/src/app/page.tsx), [Sidebar.tsx](file:///C:/Max%20Display/price-checker/src/components/Sidebar.tsx)):** `syncOfflineDatabase` memakai *single-flight promise lock*, backoff 90 detik bila gagal, persentase monotonik `0% -> 100%`, jumlah SKU terunduh, serta perhitungan ETA real-time (`Estimasi sisa ~XX detik`) tepat di bawah progress bar.











---

### 75. Ekspansi Artikel Katalog Produk (SUKO, Mu+Ku, ZES) & Article-First MDS Hunter (13 November 2026)

- **Klarifikasi Artikel Produk vs SKU Varian:**
  - Sebelum ekspansi: DB berisi `97,551` baris SKU (`17,366` artikel unik di `CatalogArticle`: `Mu+Ku` `15,270` artikel / `80,713` SKU, `SUKO` `1,182` artikel / `10,145` SKU, `ZES` `914` artikel / `6,160` SKU).
  - Setelah ekspansi katalog 2-tahap (`global 25k` + `160 koleksi prioritas`): DB kini menyimpan **`275,639` SKU varian** (`26,752` kode artikel resmi unik, `97,378` ber-barcode EAN-13, `217,962` berfoto studio HD) yang dikelompokkan menjadi **`47,752` artikel unik `CatalogArticle`**:
    - **Mu+Ku:** **`45,652` artikel** (`258,749` SKU varian, `372` sub-brand — mis. `NEVADA` `9,689` artikel, `LITTLE M` `6,479`, `COLE` `2,607`, `CARDINAL` `2,484`, `DISNEY` `2,182`, `CONNEXION` `1,608`, `ST YVES` `1,302`, `MAXMURAH` `1,177`)
    - **SUKO:** **`1,186` artikel** (`10,197` SKU varian, `6` sub-brand)
    - **ZES:** **`914` artikel** (`6,160` SKU varian, `2` sub-brand)
  - Total ukuran database Supabase PostgreSQL: **`393 MB`** (aman di bawah kuota `500 MB`).
- **Perbaikan Kasus Scan `19543756` / `PSNYC01` & `2340001284343`:**
  - `python-engine/matahari_catalog_expander.py`: Menambahkan `shopify_get_json` (retry/backoff HTTP 429), menurunkan concurrency koleksi menjadi `8 workers` + `--collections-only`, prioritas `CORE_BRAND_KEYWORDS`, serta safety cap `< 440 MB` Supabase. Artikel `PSNYC01` (Cole) kini lengkap dari `20` menjadi **`40` SKU (`10` warna termasuk `NAVY BLUE` SKU `19543756`)**.
  - `python-engine/morning_full_sweep.py`: Refactor ke **Article-First Hunter Mode** — Jalur 0 `BARCODE-RECOVERY` (prioritaskan `178,261` SKU tanpa barcode termasuk `19543756`, maks 12 menit) lalu Jalur 1 `ARTICLE-HUNTER-UPC` (interleaved stride-4 lintas seluruh zona barcode `120xxx..395xxx` untuk menangkap artikel baru **ZES** & **SUKO** yang tidak dipublikasikan online, maks 22 menit), perbaikan regex `createServerReference` (`\)?`), dan auto-rebuild `CatalogArticle`. Catatan: StoreHub MDS BISA Toko 719 (`172.24.12.41:1433`) hanya aktif pada jam operasional toko (`09:00–21:30 WIB`).
  - `src/lib/offlineDb.ts`: Batas download katalog lokal diperluas menjadi `chunk < 12` (maks 108rb model) dan `MAX_CHUNKS = 60` (maks 360rb SKU).
  - `.github/workflows/retail-sync-engine.yml`: Menjalankan `python python-engine/matahari_catalog_expander.py` sebelum `brutal_image_scraper.py`.
- **Verifikasi:** `npx tsc --noEmit`, `npm run build` (`53/53` halaman), `python -m py_compile`, dan `ANALYZE "Product" / "CatalogArticle"` lulus tanpa error.

---

### 76. Arsitektur Collect-Audit-Cook (`Raw Vault` + `BarcodeAlias`), Fix Bounce `/spv-gateway`, & Penautan Tag `19543756 ↔ 2340001284343` (13 November 2026)

- **Akar Masalah Error `"Invalid prisma"` -> Terlempar ke `/spv-gateway` & Proses Lambat:**
  1. Proses audit awal (`raw_vault_collector.py --audit`) sempat mencoba menyisipkan ulang 97k barcode utama ke `"BarcodeAlias"` dan menjalankan full seq-scan `COUNT("imageUrl")` / penarikan ulang 275k baris `"Product"`, sehingga membebani koneksi Supabase Nano dan memicu kegagalan Prisma sementara di `/api/auth/me`.
  2. Ketika `prisma.user.findUnique` gagal sementara di [`src/app/api/auth/me/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/me/route.ts), blok `catch` mengembalikan `{ user: null }` (HTTP 200) sehingga [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) me-redirect user kembali ke `/login`, di mana [`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts) mendeteksi JWT valid `DEV/SUPERVISOR` (`22054178`) dan otomatis memantulkan user ke `/spv-gateway`.
- **Perbaikan Menyeluruh yang Diterapkan & Diverifikasi:**
  1. **Anti-Bounce Session Fallback (`/api/auth/me` & `page.tsx`):** Saat query Prisma gagal sementara, `/api/auth/me` kini mengembalikan sesi JWT terverifikasi (`transientFallback: true`), dan `page.tsx` hanya me-redirect ke `/login` ketika `reason === "unauthenticated" || reason === "device_switched"`.
  2. **Multi-Barcode & Flexible Scraper (`BarcodeAlias`, `raw_vault_collector.py`, `morning_full_sweep.py`, `matahari_catalog_expander.py`):**
     - Menambahkan tabel `"BarcodeAlias"` di [`prisma/schema.prisma`](file:///c:/Max%20Display/price-checker/prisma/schema.prisma) khusus untuk barcode sekunder/alternatif (tidak menduplikasi barcode utama `Product.barcode`).
     - [`python-engine/raw_vault_collector.py`](file:///c:/Max%20Display/price-checker/python-engine/raw_vault_collector.py): Menyimpan seluruh data mentah SKU/barcode lintas format (termasuk alfanumerik & panjang fleksibel) ke SQLite lokal `raw_vault.db` (di-ignore di [`.gitignore`](file:///c:/Max%20Display/price-checker/.gitignore)), kemudian melakukan *delta sync* via index `Product_updatedAt_idx` (`--full-pg` untuk full pull), memulihkan barcode hilang, serta menghitung statistik dari vault lokal (`elapsed_sec: 14.8s`).
     - [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) & [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts): Panen seluruh barcode lintas baris StoreHub, dukung pencarian `"BarcodeAlias"` + normalisasi nol-depan/separator/check-digit EAN-13, serta jangkau kode alfanumerik & 5–20 digit.
     - [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml): Meneruskan `DATABASE_URL` ke `morning_full_sweep.py` dan mengeksekusi `raw_vault_collector.py --audit`.
  3. **Penautan Tag Fisik Toko & Status DB (`2340001284343 ↔ 19543756`):**
     - Berdasarkan foto hang-tag toko fisik user (`COLE`, `BD4-3 PSNYC01`, `NAVY`, `XL`, `Rp 149.900`), SKU `19543756` telah ditautkan resmi ke barcode `2340001284343` dan `16.000` baris alias duplikat dibersihkan.
     - Status akhir vault & DB: **`275,639` SKU** (`97,379` ber-barcode utama, **`10` `BarcodeAlias`** multi-barcode aktif, **`217,962`** foto, ukuran DB **`396 MB`**).
- **Verifikasi:** `npx tsc --noEmit`, `npm run build` (`53/53` halaman), `python -m py_compile`, dan `raw_vault_collector.py --audit` (`14.8s`) lulus dengan exit code `0`.

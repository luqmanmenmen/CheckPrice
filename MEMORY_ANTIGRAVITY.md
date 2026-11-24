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
4. **PRINSIP JALUR TOL + JALAN ALTERNATIF ("KEEP JALAN TERCEPAT, SELALU PUNYA CADANGAN SAMPAI GOAL TERCAPAI"):**
   - **Jalur Utama (Tercepat & Teruji):** Setiap jalur yang sudah ketemu & terbukti mulus (Turso HTTP Pipeline v2, `StorageObject`/`StorageChunk` 1,5 MB, `mapped_sku_paths.json.gz`, `BarcodeAlias`, `checkLiveStockFast`, `uv run`, direct webhook) **WAJIB disimpan & dipakai langsung** tanpa mencari ulang dari nol.
   - **Jalan Alternatif (Anti-Buntu / Auto-Fallback):** Jika jalur utama terkena kendala ("tanah longsor" — misal cookie kedaluwarsa, action hash berubah, barcode utama tidak cocok, foto 404, atau runner nyangkut), sistem & agen **tidak boleh berhenti gagal** melainkan otomatis beralih ke **jalur alternatif** (auto-login ulang, resolve action hash dinamis, cek `BarcodeAlias` / 7-digit→8-digit SKU, fallback pencarian artikel/CDN, auto-cancel & retry Self-Heal) sampai **tujuan (goal) benar-benar tercapai**, lalu menyimpan jalur terbaik tersebut untuk perjalanan berikutnya.

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
     - [`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), & [`python-engine/parser.py`](file:///c:/Max%20Display/price-checker/python-engine/parser.py): Mendukung penuh tag toko non-234000 (`71885502` Code-128 8-digit, `610-12265198`, vendor konsinyasi `MU+KU` alfanumerik/ber-strip/titik seperti `TP090-10-02` `Tome Ame` & `QH110.CAMEL.38`), memperluas format kamera (`EAN_8`, `CODE_39`, `CODE_93`, `UPC_E`, `ITF`, `CODABAR`), serta helper terpusat `findOfflineProductByCode`.
  3. **Penautan Tag Fisik Toko & Status DB (`2340001284343 ↔ 19543756`):**
     - Berdasarkan foto hang-tag toko fisik user (`COLE`, `BD4-3 PSNYC01`, `NAVY`, `XL`, `Rp 149.900`), SKU `19543756` telah ditautkan resmi ke barcode `2340001284343` dan `16.000` baris alias duplikat dibersihkan.
     - Status akhir vault & DB: **`275,639` SKU** (`97,379` ber-barcode utama, **`10` `BarcodeAlias`** multi-barcode aktif, **`217,962`** foto, ukuran DB **`396 MB`**).
- **Verifikasi:** `npx tsc --noEmit`, `npm run build` (`53/53` halaman), `python -m py_compile`, dan `raw_vault_collector.py --audit` (`14.8s`) lulus dengan exit code `0`.

---

### 77. Mode Kode Merah, Sensus Vendor StoreHub 24/7, & Checkpoint Jeda Pagi (13 November 2026, 04:34 WIB)

- **Upgrade Mesin Scraper Kode Merah (`commit 2477e13` -> `origin/main`):**
  1. [`python-engine/raw_vault_collector.py`](file:///c:/Max%20Display/price-checker/python-engine/raw_vault_collector.py):
     - `--collect-vendors`: Menyapu endpoint cloud StoreHub `/cv-stock` (`listVendors`, aktif 24/7) ke tabel `raw_vendor_registry` (mengantongi **`276` vendor konsinyasi & ribuan sub-brand**, termasuk vendor `953332` `KROTO NATIONAL TRADING CV.-` -> `TOME AME` dan vendor `999999` `MDS VENDOR` dengan 432+ brand).
     - `--code-red`: Memperluas jangkauan `matahari.com` hingga **seluruh `5.121` koleksi (`4.858` koleksi aktif)** & halaman global tanpa filter kaku, menyimpan seluruh varian anomali/tanpa-SKU (`SHP-*`) secara eksklusif di SQLite lokal `raw_vault.db` (tidak mencemari `"Product"` Supabase), dengan auto-flush per `100` koleksi dan fitur **Auto-Resume `< 6 jam`**.
  2. [`python-engine/matahari_catalog_expander.py`](file:///c:/Max%20Display/price-checker/python-engine/matahari_catalog_expander.py): Ekstraksi mode longgar (`strict=False`) menyimpan seluruh metadata Shopify ke `extra_json`.
  3. [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py): Mengarsipkan payload JSON StoreHub utuh ke `extra_json` vault + menambahkan sparse census probe untuk klaster SKU 8-digit (`71xxxx`).
  4. [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml): Jalur `KATEGORI 1B` menjalankan `raw_vault_collector.py --collect-vendors --collect-web --audit`.
- **Snapshot Aman Sebelum Jeda (`raw_vault.db` Verified `PRAGMA quick_check: ok`, WAL Truncated):**
  - Ukuran `python-engine/raw_vault.db`: **`346,73 MB`** (nol lock, siap matikan PC).
  - Isi `raw_items`: **`467.065` baris** (**`191.426`** `MATAHARI_SHOPIFY` + **`275.639`** `POSTGRES_PRODUCT`), **`801`** koleksi tercatat (`651` terisi -> `32.953` artikel unik Shopify), **`276`** vendor konsinyasi StoreHub.
  - Kuota Supabase tetap terjaga di **`396,03 MB` / `500 MB`**.
- **Rencana Lanjut Nanti Pagi (`>= 09:00 WIB`, Saat StoreHub Toko 719 `172.24.12.41:1433` Aktif):**
  1. Jalankan StoreHub Brutal Sweep + full JSON archival untuk menyerap `71885502` (`3 VANCE`), `TP090-10-02` (`TOME AME`), dan stok/promo riil:
     `python-engine\.venv\Scripts\python.exe -u python-engine/morning_full_sweep.py --brutal --upc-first --workers=24`
  2. Lanjutkan sisa koleksi Kode Merah `matahari.com` (`801 -> 4.858`) lalu audit & masak ke Supabase (`< 440 MB`):
     `python-engine\.venv\Scripts\python.exe -u python-engine/raw_vault_collector.py --collect-web --code-red --audit`

---

### 78. Sapuan Brutal Siang Toko 719, Auto-Image (`--with-images`), Direct-PG Image Scraper, & Milestone 302rb+ SKU (13 November 2026, 13:45 WIB)

- **Temuan Live StoreHub Toko 719 (`12:43 WIB`):**
  1. `71885502` (`3 VANCE`): Live di StoreHub sebagai `SKU 71885502` | `VendorBarcode: 2340002908552` | `StyleCode: VANCE` | `DeptName: ZES MEN` | `SS SHIRT EMBROIDERY BOXY FIT V` (`NAVY BLUE/L`, `Rp 229.900`).
  2. `TP090-10-02` (`TOME AME`): Live di StoreHub sebagai `SKU 72169883` | `VendorBarcode: TP090-10-02` | **`StyleCode: '0'`** *(anomali konsinyasi!)* | `DeptName: TOME AME` | `TM YUJIN LS PINK L:PINK:L` (`PINK/L`, `Rp 205.200`).
  3. Server StoreHub tidak menyimpan gambar produk; foto studio resmi berasal dari CDN `matahari.com` (`cdn.shopify.com/s/files/1/0666/9212/0727/`) dan kini dapat dicari otomatis begitu SKU/UPC baru ditemukan.
- **Perbaikan & Upgrade Mesin (`py_compile` & `npx tsc --noEmit` Lulus):**
  1. [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py):
     - Guard anomali `StyleCode` (`"0"`, `"-"`, `"N/A"`, `"NONE"`, `"NULL"`) agar item konsinyasi tidak kolaps menjadi artikel `'0'`.
     - Menambahkan mode `--census-sku` (probe klaster SKU 8-digit `7100000..7350000` Modulo-10 + ekspansi tetangga konsinyasi) & mode `--with-images` (otomatis aktif di `--brutal`: mencari foto langsung lewat **Raw Vault -> Sibling `(artikel, warna)` -> `matahari.com/search/suggest.json`** saat sweep berjalan + memanggil `brutal_image_scraper` di akhir).
  2. [`python-engine/brutal_image_scraper.py`](file:///c:/Max%20Display/price-checker/python-engine/brutal_image_scraper.py):
     - Memperbaiki pemuatan DB dari wave REST (yang sebelumnya berhenti di `156.000` SKU) menjadi query **Direct PostgreSQL** penuh (`280.992+` SKU) & batch SQL `UPDATE` paralel, menghasilkan **`+477` SKU baru berfoto** pada sweep penuh (total **`267.186` SKU berfoto terindeks** dari `96` sitemap + JSON + `67` koleksi + sibling).
  3. [`python-engine/raw_vault_collector.py`](file:///c:/Max%20Display/price-checker/python-engine/raw_vault_collector.py):
     - Memperpanjang jendela Auto-Resume `--code-red` menjadi `< 24 jam`.
- **Hasil Verifikasi Eksekusi Siang Ini (`LAPORAN_AUDIT_KOLEKSI.md` & `LAPORAN_SCRAP_PAGI.md`):**
  - **StoreHub Brutal + Census Sweep (`task-8776` & `task-8853`):** Menambah `+5.353` SKU baru & `+4.104` kode artikel baru langsung dari StoreHub Toko 719.
  - **Audit & Cook Raw Vault (`task-8863`, `164.8s`):** Memasak **`+21.149` SKU varian pelengkap** dengan selamat di bawah batas aman Supabase.
  - **Status Akhir Database Supabase:** **`302.141` SKU** | **`54.764` `CatalogArticle` unik** (`SUKO: 1.186` | `Mu+Ku: 52.640` lintas **`453` brand** | `ZES: 938`) | **`107.110` Barcode Utama** | **`9.797` `BarcodeAlias`** | **`239.984` Foto Produk** | Ukuran DB **`433 MB` / `500 MB`** (`raw_vault.db` lokal menampung **`482.194` baris mentah** & `276` vendor).
- **Optimasi `/api/catalog` Anti-Lama (`src/app/api/catalog/route.ts`):** Setelah `CatalogArticle` menembus `54.764` baris, jalur lama masih menarik seluruh `54.764` baris sebelum dipotong di JS (`5,4s–10,36s` di server). Diubah menjadi **Paginasi SQL Langsung** (`skip`/`take` `20` baris di mode `LIST`, `8 × 5 = 40` baris di `BRAND_PAGES`, `5 × 5 = 25` baris di `CATEGORY_PAGES`) + `npx tsc --noEmit` & `npm run build` (`53/53` route) lulus bersih.

---

### 79. Upload Gambar Barcode Ala QRIS & Perbaikan Loading Lama Pencarian SKU/Barcode (`0ms` Offline-First + Anti Full-Table Scan `20,5s`) (16 November 2026)

- **Upload Gambar Barcode Ala QRIS ([`src/lib/barcodeImageDecoder.ts`](file:///c:/Max%20Display/price-checker/src/lib/barcodeImageDecoder.ts), [`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx)):**
  - Menambahkan tombol **`Upload Gambar Barcode (Galeri)`**, dukungan *Drag & Drop*, serta *Paste (`Ctrl+V`)* di modal scanner (`/` dan `/cek-harga`).
  - Engine multi-pass mencoba `0°`, `90°`, `270°`, `180°`, padding quiet-zone putih `24px`, boost kontras grayscale, crop tengah `62%`, serta fallback `scanFileV2`, dengan prioritas kecocokan Dexie / validasi check-digit GS1.
- **Akar Masalah Loading Lama *"Memuat katalog & stok produk..."* Saat Cari Kode (`345404866839`):**
  1. Verifikasi ke Supabase, `"BarcodeAlias"`, `raw_vault.db`, dan StoreHub menunjukkan kode `345404866839` memang **tidak ada** di data toko (`{"error":"UPC not found"}`; produk mirip terdekat adalah SKU `48555706` / barcode `2340001866839`).
  2. Ketika kode tidak langsung kena index exact di Dexie, [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) menyalakan `setLoading(true)` *sebelum* mengecek kelengkapan index lokal (`db.models`) dan membiarkan `fetch` menunggu respon API server tanpa timeout. Di sisi server ([`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts)), query `contains`/`startsWith` (`LIKE`) pada kolom `sku`/`barcode` di dalam klausa `OR` (terlebih dengan `orderBy: [{ stok: 'desc' }]`) memaksa PostgreSQL melakukan *Sequential Scan* penuh pada `307.732` baris (**`24.563 ms`** di `EXPLAIN ANALYZE`, menembus timeout Vercel) karena index B-tree `en_US.UTF-8` tidak dapat dipakai untuk `LIKE` di dalam `OR`.
  3. Di [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), `findOfflineProductByCode` belum mencari index `article`, prefix `startsWithAnyOf`, dan koreksi check-digit GS1 EAN-13, sedangkan `getLocalTaxonomyOverview` & `queryLocalModelsInstant` meng-clone serta menyortir 54rb+ model di main thread.
- **Solusi Terpadu (Offline `0ms` + Fast Fail `<= 2,5s`):**
  1. [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts): Menambah kalkulasi check-digit GS1 EAN-13 (`buildCodeSearchCandidates`), pencarian `article` & prefix B-tree `startsWithAnyOf` di `findOfflineProductByCode`, serta `cachedTaxonomyOverview` tanpa clone/sort 54rb+ item.
  2. [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx): Mengecek `findOfflineProductByCode` + `queryLocalModelsInstant` *sebelum* `setLoading(true)` (`0ms` instan!), mengganti sync server pasca-hit lokal menjadi *background refresh non-blocking* `2.5s`, dan memberi batas timeout ketat **`2.500 ms`** saat DB offline lokal sudah terisi penuh (`>= 80.000` SKU) agar tidak pernah menggantung di spinner.
  3. [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts): Mengganti `startsWith` (`LIKE`) pada `sku`/`barcode` di `numericMatches` dan `buildTermOrClause` menjadi helper B-tree range `buildBtreePrefixWhere` (`gte: prefix.toLowerCase()`, `lt: prefix.toUpperCase() + '\uffff'`, terverifikasi aman untuk collation `en_US.UTF-8` di mana `:` urut sebelum digit `0`), menghapus `orderBy: [{ stok: 'desc' }]` dari SQL agar PostgreSQL memakai *Bitmap Index Scan* (`~104ms` di `numericMatches`, `0,068ms` lookup `sku`, `0,78ms` lookup `barcode`), memangkas timeout StoreHub ke `2000ms` (`900ms` saat tutup), dan menghapus fallback StoreHub ganda.
- **Verifikasi:** `npx tsc --noEmit`, `npx eslint` file baru scanner, dan `npm run build` (`53/53` route) lulus bersih dengan exit code `0`.

---

### 80. On-Demand Server Discovery: Trigger "Cari & Scrap Barang Ini di Server (StoreHub + Foto Studio + 1 Keluarga Artikel)" (16 November 2026)

- **Latar Belakang & Tujuan:** Pencarian normal (`GET /api/product/[identifier]`) sekarang **gagal cepat (`HTTP 404` tanpa menunggu StoreHub 2,7s)** kecuali bila dikirim parameter `?live=1`, sehingga HP langsung berhenti muter dan memunculkan tombol trigger khusus untuk barang/barcode baru atau yang datanya/fotonya belum lengkap.
- **Perombakan Backend & Discovery (`src/lib/mdsBisaClient.ts`, `src/app/api/live-stock/route.ts`, `src/app/api/product/[identifier]/route.ts`):**
  1. [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts):
     - Meng-upgrade `checkSingleItemStock(sku, { discoverFamily = true, withImages = true })` untuk mendukung ekspansi kandidat kode (`upc`/`sku`, perbaikan GS1 check digit 13 digit, koreksi 12 digit awalan `2*`/`234000*`, body 6/7 digit + `generateMdsSku8` Modulo-10).
     - Menambahkan `fetchMatahariFamilyAndImages(seedSku, article, seedBarcode)` yang mengambil JSON `matahari.com/search/suggest.json` & `/products/<handle>.js` dengan **cek kepemilikan ketat** (varian SKU/barcode cocok, nama file gambar mengandung SKU, atau artikel alfanumerik `>= 5` karakter cocok), memetakan foto per `sku`, per `color`, serta daftar SKU varian 1 artikel.
     - Melakukan penyapuan paralel batch-8 (batas waktu aman `5,5 detik`) terhadap `mataImages.variantSkus`, tetangga SKU Modulo-10 (`±8`), dan tetangga EAN-13 (`-6..+10`) di StoreHub Toko 719, meng-upsert aman ke `"Product"` + `"BarcodeAlias"` (termasuk guard anti tabrakan unique `barcode`), men-sync `relatedStock`, mem-backfill `imageUrl` antar-sibling yang masih kosong, lalu mengembalikan objek penuh `{ data, siblings, images, totalVariantsUpdated, newVariantsDiscovered, imagesMatched }`.
     - Jalur fallback malam (`fallbackToDb` saat toko tutup/offline) juga memakai `finalizeProductFamilyResponse` sehingga tetap mengembalikan `data`, seluruh `siblings` 1 keluarga, dan mem-backfill foto studio Matahari jika ada yang belum berfoto.
  2. [`src/app/api/live-stock/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/live-stock/route.ts): Meneruskan opsi `discoverFamily` dan `withImages` (default `true`) baik untuk `POST` maupun `GET`.
  3. [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts): Memisahkan jalur auto-live StoreHub hanya jika query string memuat `?live=1`, sehingga `GET /api/product/[kode-asing]` langsung selesai cepat `< 1s` (`HTTP 404`) dan tidak lagi menahan loading spinner.
- **Perombakan UI/UX (`src/app/page.tsx`, `src/app/cek-harga/page.tsx`):**
  1. Saat SKU/barcode belum ditemukan, kotak error langsung menampilkan tombol **`⚡ Cari & Scrap Barang Ini di Server (StoreHub + Foto + 1 Keluarga Artikel)`** yang memicu `POST /api/live-stock`, mengisi kartu detail lengkap 1 keluarga artikel + galeri foto, sekaligus menyimpannya ke IndexedDB Dexie HP (`persistServerFamilyToLocal`).
  2. Pada kartu detail produk yang belum punya foto atau baru memiliki 1 varian (`!heroImages.length || sourceSiblings.length <= 1`), tombol aksi menampilkan **`⚡ Live Stok & Scrap 1 Artikel + Foto`**.

---

### 81. Fix Review Warna Auto-Scroll Foto, Penghapusan Tombol Kuning Bermasalah, & Kurasi Sticky Bottom Bar "Add Keranjang" (16 November 2026)

- **Masalah Yang Diperbaiki ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
  1. **Klik warna/size untuk review malah masuk Facing Out:** Ketukan pada kotak size sebelumnya memanggil `quickTapSizePill()` yang otomatis memanggil `adjustVariantQty(..., +1)`. Kini diganti `handleReviewSizeVariant()` yang **hanya mem-preview varian tersebut tanpa menambah jumlah**, sedangkan penambahan kuantitas dilakukan secara eksplisit lewat tombol `+ Pilih` / `−` / `+`.
  2. **Klik warna kini auto-scroll mulus ke foto produk di atas:** Menambahkan `productPhotoTopRef`, helper `scrollToProductPhoto()`, parameter `scrollToPhoto = true` pada `handleSelectVariant(cg.repSku, true)` di kartu warna maupun strip pill **Review Warna** tepat di bawah judul produk agar user langsung melihat foto warnanya tanpa capek scroll ke atas secara manual.
  3. **Menghapus tombol kuning bermasalah (klik +5 malah terbaca 1 pcs) & menyatukan stepper dengan Bottom Bar "Add Keranjang":**
     - Menghapus tombol kuning `Facing Out` dan stepper terpisah di kotak harga atas (kini diganti ringkasan **Varian Aktif** + tombol **Cetak Label**).
     - Menyatukan `qty` dan `multiVariantQty` melalui `setActiveVariantStepperQty`, sinkronisasi `adjustVariantQty`, serta `handleUnifiedAddToCart()` (sehingga berapa pun jumlah yang diketuk di kotak size maupun stepper bawah — misalnya `5 pcs` — dikirim akurat ke keranjang).
     - Menghadirkan **Curated Sticky Bottom "Add Keranjang" Bar** dengan preset cepat (`1 Size Ini`, `+1 Warna ...`, `+1 Artikel Full`), stepper terpadu, indikator `Keranjang Aktif` + tombol kirim langsung, serta **2 tombol utama** (`+ Keranjang, Pilih Lagi` & `+ Keranjang (... Pcs)` / `+ Tanya Stok (... Pcs)`).
  4. **Pembenahan Daftar Kirim / Keranjang (`Daftar Kirim`):** Menampilkan total varian & total pcs (`X Varian • Y Pcs`), daftar item + kontrol `−`/`+` kuantitas di HP maupun Desktop (disembunyikan di HP sementara kartu produk sedang terbuka agar tidak menumpuk dengan Bottom Bar).

---

### 82. Perbaikan Live Stok 1x Klik, Python Compressed DB Offline CDN (8,35 MB), Pisah Versi Stok vs Katalog, & Scan Anti-Hang (16 November 2026)

1. **Live Stok Langsung Berubah pada Klik Pertama (`src/app/page.tsx`, `src/lib/mdsBisaClient.ts`):**
   - `handleCheckLiveStock()` sebelumnya selalu mengirim `discoverFamily: true, withImages: true` di setiap klik sehingga eksekusi menembus `12–20+ detik` (sering gagal/timeout pada klik ke-1). Kini `discoverFamily: true, withImages: true` hanya aktif bila foto atau varian keluarga memang belum ada (`curSibs.length <= 1 || !curSibs.some(s => Boolean(s.imageUrl))`); tombol `"Live Stok"` normal memakai mode cepat (`~2–3,7s`).
   - Menambahkan `liveStockEpochRef` agar background refresh `presentLocalProductAndRefreshBg()` tidak pernah menimpa hasil Live Stok yang baru diklik.
   - Di `mdsBisaClient.ts`, `freshStockBySku` langsung menimpa nilai `stok` pada `data` dan `siblings` sebelum respon dikembalikan, plus `relatedStock` di-update secara batch per kuantitas (`updateMany`) serta budget probe tetangga dirampingkan (`3.5s`).

2. **Database Offline Dibangun oleh Python + CDN Snapshot Terkompresi (`python-engine/build_offline_snapshot.py`, `src/lib/offlineDb.ts`, `.github/workflows/retail-sync-engine.yml`):**
   - Python mengompilasi `307.732 SKU`, `56.194 Model CatalogArticle`, dan `14.999 BarcodeAlias` langsung dari PostgreSQL dengan *tuple encoding + string dictionary* ke **1 berkas CDN `.json.gz`** (`offline-db/snapshot-<rev>.json.gz`, ukuran aktual **`8,35 MB`** dari `63,04 MB` mentah) + `offline-db/manifest.json`.
   - `src/lib/offlineDb.ts` (Dexie `v13` dengan tabel tambahan `aliases`) mengunduh 1 berkas CDN secara *streaming*, mendekompresi memakai native `DecompressionStream('gzip')`, menulis batch besar (`15.000 SKU/tx`), dan langsung mengisi `db.models` + RAM tanpa `rebuildModelsIndexFromProducts()` (`db.products.toArray()`). Jalur lama `/api/export-products` dipertahankan sebagai fallback cadangan.

3. **Update Stok Tidak Lagi Menyalakan Banner Merah `"UPDATE SEKARANG"` (`src/app/api/check-update/route.ts`, `src/app/api/last-update/route.ts`, `src/app/page.tsx`):**
   - `serverVersion` dipisah menjadi `catalogVersion` (hanya naik dari `SyncHistory` tipe `CATALOG_BUNDLE`, `MDS_BISA_SYNC`, `PHOTO_SYNC`, `UPDATE_PROMO`, `PROMO_MINGGUAN`, `EXCEL_UPLOAD`, `SYNC_PQ`, atau manifest katalog), bukan lagi dari `MAX(Product.updatedAt)`.
   - `--stock-only` pada `.github/workflows/retail-sync-engine.yml` dan `build_offline_snapshot.py --stock-only` memperbarui stok di snapshot sambil **mempertahankan `catalogVersion` tetap sama**.

4. **Pencarian/Scan SKU Eksisting Anti-Hang & Anti-Abort Prematur (`src/app/page.tsx`, `src/lib/offlineDb.ts`, `src/app/api/product/[identifier]/route.ts`):**
   - `findOfflineProductByCode` kini ikut memeriksa tabel `db.aliases` (`barcode`/`barcodeNorm`) dan `article` *case-insensitive*, dengan race timeout aman (`550ms` saat IndexedDB sibuk sync, `1.800ms` normal).
   - Scan kode (`isCodeSearch`) tidak lagi memblokir UI thread memanggil `ensureModelsIndexReady()` (12 chunk `/api/catalog-models` / `db.products.toArray()`) sebelum mencari ke server; `queryLocalModelsInstant` hanya dipakai untuk kode jika RAM sudah siap (`getLoadedModelsMemoryCache()`).
   - Timeout fetch server dinaikkan dari `2.500ms` ke `6.500ms` (lokal siap) / `12.000ms` (lokal kosong), dan di `GET /api/product/[identifier]` cabang `article ILIKE` dilewati untuk kode numerik panjang (`>= 11` digit) agar scan barcode tidak menyentuh indeks trigram `article`.

- **Verifikasi:** `build_offline_snapshot.py` teruji langsung (`307.732 SKU`, `56.194 Model`, `14.999 Alias`, `8.753.987 byte` terverifikasi dari CDN Storage), `py_compile` lulus, `npx tsc --noEmit` dan `npm run build` (`53/53` route) lulus exit code `0`.

---

### 83. Notif `"UPDATE SEKARANG"` Ketat Hanya untuk Produk Baru atau Promo Berubah (16 November 2026)

- **Masalah:** Sebelumnya `CATALOG_SYNC_TYPES` di [`/api/check-update`](file:///c:/Max%20Display/price-checker/src/app/api/check-update/route.ts) dan [`/api/last-update`](file:///c:/Max%20Display/price-checker/src/app/api/last-update/route.ts) masih mengikutkan event yang sering berjalan tanpa produk baru atau perubahan promo (`MDS_BISA_SYNC`, `PHOTO_SYNC`, `EXCEL_UPLOAD`, `SYNC_PQ`), serta [`python-engine/build_offline_snapshot.py`](file:///c:/Max%20Display/price-checker/python-engine/build_offline_snapshot.py) selalu menaikkan `catalogVersion` dan mencatat `CATALOG_BUNDLE` setiap kali dijalankan tanpa `--stock-only` meskipun hanya ada pergerakan stok `1 pcs`.
- **Perubahan Arsitektur ("Python yang Mikir, Vercel Display"):**
  1. **Deteksi Sidik Jari Katalog (`skuHash` & `promoHash`) di [`python-engine/build_offline_snapshot.py`](file:///c:/Max%20Display/price-checker/python-engine/build_offline_snapshot.py):**
     - Menambahkan fungsi `compute_catalog_hashes()` untuk menghitung SHA-256 `skuHash` (dari himpunan terurut `(sku, article)`) dan `promoHash` (dari himpunan promo aktif `(sku, hargaPromo, diskon, discountType, acara, toDate)` yang belum kadaluarsa) dengan **mengabaikan `stok`, `imageUrl`, sales, dan `updatedAt`**.
     - Menambahkan `decide_catalog_version_bump()` untuk membandingkan `skuHash` dan `promoHash` terhadap `offline-db/manifest.json` sebelumnya:
       - `catalogVersion` dinaikkan dan `CATALOG_BUNDLE` dicatat ke `SyncHistory` **HANYA** jika `not stock_only` dan (`NEW_PRODUCT`, `PROMO_CHANGED`, `NEW_PRODUCT_AND_PROMO`, atau `INITIAL`).
       - Jika tidak ada produk baru maupun perubahan promo (`NONE` / `STOCK_ONLY` / migrasi awal `SEED_HASHES`), `catalogVersion` dipertahankan dan `SyncHistory` tidak ditulis, sementara `snapshot-*.json.gz` dan `bundleRevision` tetap diperbarui dengan stok serta foto terbaru.
  2. **Filter Ketat Endpoint Update ([`src/app/api/check-update/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/check-update/route.ts) & [`src/app/api/last-update/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/last-update/route.ts)):**
     - `CATALOG_SYNC_TYPES` dipersempit hanya ke `CATALOG_BUNDLE`, `UPDATE_PROMO`, dan `PROMO_MINGGUAN`, dengan syarat tambahan `records: { gt: 0 }` pada kueri `SyncHistory`.
     - Menghapus `MDS_BISA_SYNC`, `PHOTO_SYNC`, `EXCEL_UPLOAD`, dan `SYNC_PQ` dari pemicu `catalogVersion`.
  3. **Penjagaan Log Promo Kosong ([`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py)) & Salinan Banner ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - `run_promo_sync.py` hanya mencatat `UPDATE_PROMO` ke `SyncHistory` bila `total > 0` (atau `grand_total > 0`).
     - Teks sub-judul banner di `src/app/page.tsx` disesuaikan menjadi `"Ada produk baru, update promo, atau fitur sistem terbaru."`.
- **Verifikasi:**
  - `python-engine\.venv\Scripts\python.exe -m py_compile` lulus (`0`).
  - Unit assertion Python (`SEED_HASHES`, `NONE`, `NEW_PRODUCT`, `PROMO_CHANGED`) lulus (`0`).
  - Dua kali eksekusi langsung `build_offline_snapshot.py`:
    - Tahap 1 menghasilkan `reason=SEED_HASHES, bump=False, promoAktif=5,246, catalogVersion=1794784498977` (skip `SyncHistory`).
    - Tahap 2 menghasilkan `reason=NONE, bump=False, promoAktif=5,246, catalogVersion=1794784498977` (skip `SyncHistory`, `raw=63.04 MB -> gzip=8.35 MB`, `307,732 SKU`, `56,194 Model`, `14,999 Alias`).
  - `npx tsc --noEmit` (`0`) dan `npm run build` (`53/53` route, exit code `0`).

---

### 84. Perbaikan Semua Lintasan Foto ("Gagal Memuat" / Shopify 404), Pure E-Commerce Qty 0 saat Scan, & Kurangi ke 0 / Batal Request Facing Out (16 November 2026)

- **Akar Masalah Foto "Gagal Memuat":**
  1. Matahari.com merotasi/mengunggah ulang foto produk di `cdn.shopify.com` dengan UUID baru sehingga sebagian URL lama di DB (misal `D2M4346J4` `v=1793094601`, `34004069-1` `v=1794431133`) mengembalikan **HTTP 404 Not Found**.
  2. `optimizeRetailImageUrl` di [`src/components/ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx) menambahkan query `?width=...` yang ditolak HTTP 404 oleh beberapa file Shopify CDN lama (`bad_width=13/30`), sementara thumbnail strip, kartu katalog, dan `ImageLightboxModal` belum memiliki fallback `onError` + auto-heal.
- **Perbaikan Semua Lintasan Foto:**
  1. [`src/components/ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx) & [`src/components/ImageLightboxModal.tsx`](file:///c:/Max%20Display/price-checker/src/components/ImageLightboxModal.tsx): `optimizeRetailImageUrl()` kini menormalkan URL HTTPS tanpa menyisipkan `?width=` (mengembalikan URL asli tanpa `width`). Thumbnail, gambar utama, dan lightbox memiliki proteksi `onError` + prop `onBrokenImages` yang otomatis memicu pemulihan sekali saat URL gagal dimuat.
  2. **Auto-Heal Realtime Saat Foto 404** ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`src/app/api/product/heal-image/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/heal-image/route.ts), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts)): Menambahkan `healProductImagesInDb()`, endpoint `POST /api/product/heal-image`, dan `updateOfflineFamilyImages()` untuk mengambil ulang URL studio terbaru dari `matahari.com`, memperbarui `Product` & `CatalogArticle` di PostgreSQL, serta memperbarui state UI dan IndexedDB lokal.
  3. **Python Bulk Image Healer** ([`python-engine/repair_broken_images.py`](file:///c:/Max%20Display/price-checker/python-engine/repair_broken_images.py)): Utilitas Python multi-threaded (`ThreadPoolExecutor`) untuk mendeteksi URL `404` dan memulihkan langsung dari Matahari.com (`--articles` / `--scan-limit` / `--all`).
- **Perbaikan Perilaku E-Commerce & Hapus Request Facing Out (`0` Pcs) ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
  1. **Scan/Buka Produk Mulai dari `0` (Pure E-Commerce):** Mengubah default `qty` menjadi `0`, menghilangkan fallback `pendingVariantsCount = 1` dan penghitungan `qty = 1` saat scan/ganti artikel/ganti varian, serta menghapus fallback diam-diam memasukkan `1 pcs` ke `cart` di `handleUnifiedAddToCart()`. Sebelum memilih ukuran (`+ Pilih` / `+` / preset cepat), Bottom Bar menampilkan `0 pcs`, `0 Varian • Pilih ukuran`, dan tombol `+ Keranjang` non-aktif (`Pilih Size Dulu`).
  2. **Kurangi Sampai `0` = Batal / Hapus Request:** `setActiveVariantStepperQty()` kini mengizinkan penurunan hingga `0` (menghapus SKU dari `multiVariantQty`); tombol `−` Bottom Bar bisa mengurangi pilihan hingga `0` (ditambah tombol cepat `Hapus (0)`); `adjustCartItemQty()` menghapus item dari `Daftar Kirim` saat mencapai `0`; serta tab `Cek Pesanan` menyediakan tombol `Batalkan / Hapus Request` untuk tiket berstatus `PENDING`.
- **Verifikasi:** `py_compile` lulus (`repair_broken_images.py` memulihkan `3 artikel / 40 SKU`: `D2M4346J4`, `T1M2546J2`, `W2M2466I4`), `build_offline_snapshot.py` terunggah (`307,732 SKU`, `56,194 Model`, `15,000 Alias`, `8.35 MB`, `catalogVersion=1794784498977` tetap), `npx tsc --noEmit` (`0`), dan `npm run build` (`53/53` halaman) lulus (`exit code 0`).

---

### 85. Live Stok 1-Klik All Warna & Size, Fix Parser Folder Promo `PROMO 19 25 NOV 2026`, Filter Sedang Promo Lintas Halaman, Teknologi Kain SUKO, & Penyeragaman Trigger Engine v2.7.0 (19 November 2026)

1. **Bottom Trigger `Live Stok` 1-Klik Update Semua Warna & Size Serentak ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`src/app/api/live-stock/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/live-stock/route.ts), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
   - Menambahkan opsi `syncAllSizes` (default `true`) di `checkSingleItemStock` dan `/api/live-stock`. Selain memperbarui `seedSku`, `allItems`, dan `relatedStock` (dengan normalisasi singkatan warna retail `MED`/`MDM`↔`MEDIUM`, `DRK`↔`DARK`, `LGT`↔`LIGHT`, `BLK`↔`BLACK`, `WHT`↔`WHITE`, `NVY`↔`NAVY`, `GRY`↔`GREY`), mesin langsung mem-probe secara paralel seluruh SKU saudara (`existingFamilySkus`) dalam artikel yang sama yang belum terjangkau `relatedStock` (`batch 12`, timeout `3000ms`, budget `5500ms`), serta memperbarui `CatalogArticle.articleTotalStok`.
   - Di frontend `handleCheckLiveStock()`, hasil stok langsung disinkronkan ke `product`, `siblings`, `sessionCacheRef`, dan RAM cache model lokal (`updateLocalFamilyStockInMemory`) tanpa perlu 2x klik.

2. **Perbaikan Mesin Update Promo (`PROMO 19 25 NOV 2026` & Speedup `ai_helper`) ([`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py), [`python-engine/ai_helper.py`](file:///c:/Max%20Display/price-checker/python-engine/ai_helper.py), [`python-engine/build_catalog_index.py`](file:///c:/Max%20Display/price-checker/python-engine/build_catalog_index.py)):**
   - **Akar Masalah:** `parse_folder_date_score()` di `run_promo_sync.py` sebelumnya memakai regex `(\d{1,2})\s*[-_]\s*(\d{1,2})?` yang gagal membaca spasi pada folder `PROMO 19 25 NOV 2026` (skor jatuh menjadi `20261101`, kalah dari `Promo 12-18 NOV` `20261112`) sehingga Trigger Promo terus membaca minggu lalu yang kedaluwarsa (`toDate: 2026-11-18`).
   - Regex `parse_folder_date_score()` diperbaiki untuk mendukung spasi/tanda hubung/lintas bulan (`2026112519 -> PROMO 19 25 NOV 2026`), ditambah pembersihan promo expired (`< today_wib`), dan penyesuaian timezone WIB (`UTC+7`) pada `build_catalog_index.py`.
   - `ai_helper.py` ditingkatkan memakai `gemini-2.5-flash`/`gemini-2.0-flash`, fast-path kolom standar promo, cache skema kolom, dan *circuit breaker* agar eksekusi 15 file promo tuntas dalam ~50 detik tanpa macet oleh timeout `503`.

3. **Fakta Stok Katalog (`O2OW33J9` Stok `1.067`):**
   - Diperiksa langsung dari PostgreSQL: artikel `O2OW33J9` (`JAKET KATUN TWILL OUTERWEAR WO`) memiliki `32` varian warna/ukuran dengan stok fisik berkisar `13–57 pcs` per SKU (total real `1.067 pcs`). Angka stok di kartu katalog merupakan akumulasi real seluruh varian dalam 1 artikel, bukan data dummy.

4. **Filter `Sedang Promo` Lintas Halaman & Drill-Down Parent Artikel -> SKU Promo ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`src/app/api/catalog/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/[identifier]/route.ts)):**
   - Menambahkan parameter `onlyPromo` dan metrik `promoCount` total lintas seluruh hasil pada `queryLocalModelsInstant()`, `/api/catalog`, dan `/api/product/[identifier]` dengan validasi `toDate` WIB (`isItemPromoActive` / `isLocalPromoActive`).
   - Hasil tetap tampil per parent artikel (`1 kartu = 1 artikel`); saat diklik dari filter `Sedang Promo` (atau bila artikel berisi campuran SKU promo & non-promo), detail produk otomatis memilih SKU promo berjalan dan menyediakan tombol toggle `🏷️ Hanya SKU Promo (X)` vs `Semua Varian (Y)`.

5. **Pencarian Kategori Teknologi Kain SUKO ([`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
   - Menambahkan ekspansi frasa & sinonim khusus untuk `SUKO GO`, `SOFT TOUCH` (`CLOUD SOFT`, `CUPRO`), `SUPIMA`, `CLIMAFLEX` (`CLIMA TECH`, `CLIMATECH`), `QUICKDRY` (`QUICK DRY`, `EASY DRY`), `COOL TOUCH`, serta `FLEX` / `FLEKSIBEL` (`4-WAY STRETCH`, `STRETCH`, `RILEKS`), plus bar chip 1-klik `Teknologi Kain` saat memilih Toko `SUKO`.

6. **Trigger Spesifik SKU Not-Found & Penyeragaman Versi Engine `v2.7.0` ([`src/lib/version.ts`](file:///c:/Max%20Display/price-checker/src/lib/version.ts), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), [`src/app/api/admin/trigger/github-dispatch/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts), [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml), [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx), [`src/app/super-admin/update-promo/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/update-promo/page.tsx)):**
   - Ketika SKU/barcode tidak ditemukan, tersedia tombol cepat khusus menarik data & gambar SKU spesifik (`discoverFamily: false, withImages: true`) maupun tombol penarik 1 keluarga artikel lengkap.
   - Menyamakan `APP_VERSION = "2.7.0"` di Portal Kasir maupun Pusat Trigger Super Admin (`Kategori 3 Update Promo`, `Kategori 4 Build Catalog & Snapshot`, dan `All Trigger Kat 1–4` di `.github/workflows/retail-sync-engine.yml`).

- **Verifikasi:** `npx tsc --noEmit` (`0`), `npm run build` (`53/53` route, `exit code 0`), `run_promo_sync.py` memperbarui `8,563` SKU dari `15 file` folder `PROMO 19 25 NOV 2026` (`68182107` menjadi `Rp 299.000`, `SP299`, `2026-11-19` s/d `2026-11-25`, `5,577` promo aktif & `0` expired), serta `build_catalog_index.py` membangun `57,367 CatalogArticle` & mengunggah snapshot CDN `310,526 SKU` / `8.50 MB` (`reason=PROMO_CHANGED`, `promoAktif=5,744`, `catalogVersion=1795027206662`).

---

### 86. Deteksi 0ms Barcode/SKU Tidak Terdaftar + Tombol Instan Scrap MDS BISA & Matahari.com (19 November 2026)

- **Masalah:** Ketika kasir men-scan/mencari barcode atau SKU yang memang belum ada di database, [`GET /api/product/[identifier]`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts) sempat melakukan `OR` prefix scan + `article ILIKE` pada 310rb+ baris dan [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) menunggu timeout fetch `6.500–12.000ms` dengan spinner loading sebelum menampilkan tombol trigger scrap.
- **Perbaikan:**
  1. **`GET /api/product/[identifier]` (`?fast=1` & kode 8–20 digit):** Setelah cek exact match B-tree (`sku`, `barcode`, `BarcodeAlias`), prefix scan hanya dipakai jika panjang digit `<= 7` dan bukan mode `fast=1`, serta tanpa `article ILIKE` di blok numerik; kode yang tidak ditemukan langsung mengembalikan `404` tanpa jatuh ke query teks berat atau Gemini AI.
  2. **UI 0ms Instan di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx):** Bila DB offline sudah siap (`localDbReady`) dan `findOfflineProductByCode` tidak menemukan kode tersebut, UI langsung (`0ms`) menampilkan panel aksi dengan tombol **`Scrap MDS BISA & Matahari: SKU "<kode>" + Gambar`** (dan opsi **`Scrap 1 Keluarga Artikel Lengkap + Foto`**), sementara verifikasi server ringan (`?fast=1`, batas `1.800ms`) berjalan di latar untuk menangkap barang super baru tanpa menahan layar. Jika DB lokal kosong, timeout pencarian kode dipersingkat menjadi `2.800ms` dengan `?fast=1`.
- **Verifikasi:** `npx tsc --noEmit` (`0`) dan `npm run build` (`53/53` halaman) lulus exit code `0`.

---

### 87. Perbaikan Scan Barcode Kamera Live di iPhone Safari (ZXing `TRY_HARDER`, Pixel Contrast Boost, Auto-Zoom 1.5x, & Tombol Jepret & Scan) (19 November 2026)

- **Masalah dari Foto Pengguna:** Kamera belakang iPhone Pro di Safari (`luqmanganteng.my.id`) menyala normal dan hangtag SUKO berada di dalam kotak bidik hijau, namun tidak kunjung terbaca.
- **Akar Masalah:**
  1. Safari iOS belum mendukung `window.BarcodeDetector` native sehingga bergantung penuh ke `html5-qrcode` (`ZXingHtml5QrcodeDecoder`). Secara bawaan `html5-qrcode` v2.3.8 menyetel `DecodeHintType.TRY_HARDER` (`key = 3`) ke `false`, sehingga barcode 1D `EAN-13`/`Code-128` hanya dipindai dangkal pada beberapa baris piksel dan gagal saat ada sedikit blur atau pantulan lampu toko.
  2. Safari iOS mengabaikan properti `ctx.filter` pada canvas `2D`, sedangkan kamera WebRTC iPhone Pro memakai lensa `1x` (jarak fokus minimum ~18–20cm) dengan resolusi awal `1280x720` tanpa opsi zoom sehingga pengguna cenderung mendekatkan HP terlalu dekat hingga buram.
- **Perbaikan ([`src/lib/barcodeImageDecoder.ts`](file:///c:/Max%20Display/price-checker/src/lib/barcodeImageDecoder.ts) & [`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx)):**
  1. **Aktifkan ZXing `TRY_HARDER` (`enableZxingTryHarder`) + `useBarCodeDetectorIfSupported: false`:** Memaksa seluruh instance `ZXingHtml5QrcodeDecoder` menyapu barcode 1D jauh lebih teliti; di browser tanpa native `BarcodeDetector`, hasil yang lolos check-digit GS1 / 8-digit SKU langsung dieksekusi dalam `1` frame tanpa menunggu `2–3` frame berulang.
  2. **Kontras Adaptif Pixel-Buffer (`applyPixelContrastBoost`) & 4-Pass Rotasi Live:** Menggantikan ketergantungan pada `ctx.filter` dengan peregangan luminansi grayscale langsung di `ImageData` (`canvas` crop hingga `1120px`), berputar 4 mode (`pita horizontal normal`, `pita horizontal + kontras adaptif`, `area tengah luas + kontras`, dan `rotasi 90° + kontras` untuk tag vertikal/miring).
  3. **Resolusi Ideal Full-HD (`1920x1080`) & Preset Zoom iPhone (`1x / 1.5x / 2x`):** Mengaktifkan default `1.5x` zoom pada kamera belakang perangkat iOS Safari (memakai hardware `track.applyConstraints({ advanced: [{ zoom }] })` jika didukung, atau crop digital tersinkronisasi + skala `<video>`), serta tombol cepat `1x / 1.5x / 2x` di pojok kanan atas agar tag tetap tajam dari jarak ~18–22cm.
  4. **Tombol Cadangan 1-Ketuk `Jepret & Scan` (`decodeBarcodeFromCanvas`):** Mengambil satu frame resolusi penuh dari kamera live lalu memindainya lewat 8 variasi rotasi (`0°/90°/270°/180°`), *quiet-zone padding* putih, dan *pixel contrast boost* di samping tombol `Upload Foto`.
- **Verifikasi:** `npx tsc --noEmit` (`0`) dan `npm run build` (`53/53` halaman) lulus `exit code 0`.

---

### 88. Penyelamatan Supabase Disk IO Budget (Audit `pg_stat_statements`, Hapus `142` File Promo/PQ Lama, `VACUUM ANALYZE`, & Optimasi Query Berat) (19 November 2026)

- **Laporan Pengguna:** Email Supabase `Your Supabase Project is running out of Disk IO Budget` beserta permintaan untuk membersihkan file promo/PQ lama sambil menjaga file promo terbaru (`PROMO 19 25 NOV 2026`).
- **Temuan Audit Langsung PostgreSQL & Supabase Storage:**
  1. **Storage Bucket (`excel-uploads`) tidak penuh** (`51 MB` total, `161` file), namun menampung `142` file usang (`10` file `PQ/POWER QUERY/*.csv` 10–21 Okt 2026 ~30 MB, `131` file promo lama `< 19 Nov 2026`, serta `1` file `Debug/test_gas.csv`).
  2. **Akar Masalah Disk IO Budget Sebenarnya** berasal dari IOPS baca/tulis disk pada PostgreSQL (`Product` `399 MB` dengan `41.320` dead tuples + `139 MB` index):
     - Query **#0** (`50 calls`, **`934.974 disk_blks_read` ≈ 7,48 GB**): `/promo-unik` & `/barang-baru` tanpa `select` memindai tabel penuh `Product` (`discountType CONTAINS` tanpa index & `orderBy createdAt` tanpa index).
     - Query **#1 & #3** (`797` + `240 calls`, **`829.202 disk_blks_read` ≈ 6,63 GB**): endpoint fallback `/api/export-products` beserta `prisma.product.count()` full index scan (juga dipanggil di 404 `/api/product/[identifier]` dan `/api/admin/sales-report`).
- **Tindakan & Perbaikan:**
  1. **Pembersihan Supabase Storage (`excel-uploads`):** Menghapus bersih `142` file lama (`PQ/*`, `Debug/*`, dan semua `PROMO/*` selain `PROMO/PROMO 19 25 NOV 2026/*`) melalui Supabase Storage REST API, menyisakan `19` file aktif (`15` file `PROMO 19 25 NOV 2026`, `offline-db/manifest.json` + `snapshot-1795027206662.json.gz`, dan `secrets/*`).
  2. **Pembersihan Bloat Database:** Menjalankan `VACUUM (ANALYZE)` pada `Product`, `CatalogArticle`, `BarcodeAlias`, dan `SyncHistory` (dead tuples turun menjadi `0` di seluruh tabel).
  3. **Estimasi Hitung O(1) (`getEstimatedProductCount`):** Menambahkan helper berbasis `pg_class.reltuples` (`0` block scan, cache `10` menit) di [`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts) menggantikan full `product.count()` di [`src/app/api/export-products/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/export-products/route.ts) (`META_TTL_MS = 300s`, `s-maxage=600`), [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts), dan [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts).
  4. **Eliminasi Full Table Scan & Dump:** Mengalihkan [`src/app/promo-unik/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/promo-unik/page.tsx) ke `CatalogArticle` (`articleHasPromo: true` + `unstable_cache` 5 menit), [`src/app/barang-baru/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/barang-baru/page.tsx) ke `orderBy: { id: 'desc' }` (memakai Primary Key + `unstable_cache` 5 menit), serta membatasi endpoint legacy [`src/app/api/sync-offline/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/sync-offline/route.ts) (`take: 2000`, `orderBy: { id: 'desc' }`).
- **Verifikasi:** `142` file lama terhapus via Storage API, `VACUUM ANALYZE` tuntas (`dead_tup = 0`), `npx tsc --noEmit` (`0`), dan `npm run build` (`53/53` halaman) lulus `exit code 0`.

---

### 89. Mesin Dekoder EAN-13 Sub-Pixel Soft-Edge untuk Upload Gambar, Scan Foto, & Kamera Live Safari (19 November 2026)

- **Masalah Pengguna:** Upload gambar dan scan foto galeri tidak berhasil membaca barcode hangtag.
- **Pembuktian Benchmark Nyata (Foto Asli SUKO Hangtag `WhatsApp Image 2026-09-19 at 19.00.07.jpeg` `720x1280`):**
  - `ZXing` (`html5-qrcode`) melempar `NotFoundException` (`null`) pada seluruh orientasi & binarizer (`Hybrid` maupun `Global`, baik crop penuh, `62%`, maupun *lower band* + `3x upscale`) karena kompresi foto HP membuat celah putih `1-module` bernilai abu-abu (`~188–207`) dan batang gelap `1-module` bernilai (`~77–94`), sedangkan batang tebal bernilai `~35`, sehingga threshold global ZXing mengacaukan rasio ketebalan modul.
  - Selain itu, pada hangtag SUKO posisi barcode kerap berada di **sepertiga bawah (`y ≈ 60–88%`)**, bukan tepat di tengah (`cropRatio: 0.62` memotong barcode), dan foto kecil tidak di-*upscale*.
- **Perbaikan ([`src/lib/barcodeImageDecoder.ts`](file:///c:/Max%20Display/price-checker/src/lib/barcodeImageDecoder.ts) & [`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx)):**
  1. **Dekoder Sub-Pixel Soft-Edge EAN-13 (`decodeEan13SoftEdgeFromCanvas`):** Menambahkan dekoder murni berkecepatan tinggi (`~10–41ms`, `0` dependensi eksternal) yang menghitung rata-rata luminansi 3 baris bertetangga, jendela threshold adaptif lokal (`+4%` kompensasi celah putih), interpolasi posisi tepi sub-piksel, pencocokan 59 segmen EAN-13 (`L`/`G`/`R`), dan validasi check-digit GS1 Modulo-10.
  2. **Integrasi Menyeluruh:** Dipasang sebagai jalur prioritas di `decodeCanvasWithEngines` (`Upload Foto` & `Jepret & Scan`) **maupun** loop kamera live `decodeFrameTick()` di `TextScanner.tsx` sebelum S-curve *contrast boost* (sangat membantu iOS Safari tanpa `BarcodeDetector`).
  3. **Sliding Crop Region + Upscale + Kemiringan `±7°` (`IMAGE_DECODE_VARIANTS`) & Fallback DataURL:** Menambahkan crop pita bawah (`yCenterRatio: 0.72`), pita atas (`0.30`), kemiringan `-7°` / `+7°`, dukungan *upscale* hingga `2x` pada foto beresolusi rendah, dukungan ekstensi `.heic`/`.heif`, serta fallback `FileReader.readAsDataURL` bila `URL.createObjectURL` gagal di WebKit galeri tertentu.
- **Verifikasi:** Uji langsung di Node pada foto nyata SUKO menghasilkan **`2340002272943`** dengan `39 scanline hits` (`32ms`) di `Barcode Suko.jpeg` dan `24 scanline hits` (`41ms`) di `WhatsApp Image 2026-09-19 at 19.00.07.jpeg` (yang sebelumnya `null` di ZXing); `npx tsc --noEmit` & `npm run build` lulus `exit code 0`.

---

### 90. Implementasi Opsi A: Konsolidasi Olah Promo, Excel, & Analitik Berat ke `python-engine/` (19 November 2026)

- **Keputusan Pengguna:** Menyetujui rekomendasi **Opsi A**: memensiunkan mesin olah promo/Excel & hitungan laporan berat dari TypeScript (agar satu pintu di Python, bebas bentrok, dan hemat *Disk IO* Supabase), sambil tetap mempertahankan Next.js TypeScript untuk UI display, mode offline HP, auth/tiket, serta jalur realtime cepat (`live-stock` & lookup scan).
- **Implementasi Baru & Refactoring:**
  1. **Mesin Python Terpadu [`python-engine/run_admin_analytics.py`](file:///c:/Max%20Display/price-checker/python-engine/run_admin_analytics.py) & [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml):**
     - Menangani `--clean-promo` (1 query `UPDATE` berbasis tanggal WIB), `--generate-po` (`INSERT ... SELECT ... WHERE NOT EXISTS` atomik), serta `--analytics` yang menyusun JSON matang (`analytics/promo-analysis.json` & `analytics/sales-report-summary.json`) lalu mengunggahnya ke Supabase Storage CDN.
     - Terhubung langsung sebagai **Kategori 5 (`analytics`)** di [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), dan [`/api/admin/trigger/github-dispatch`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts), berjalan otomatis setelah `promo`, `stock-only`, `catalog`, atau `all`.
  2. **Pensiunkan Parser Excel & Promo TypeScript/Browser (Thin Dispatchers ke Python):**
     - [`src/app/api/upload/chunk/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/upload/chunk/route.ts), [`src/app/api/upload/reprocess-from-blob/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/upload/reprocess-from-blob/route.ts), [`src/app/api/upload/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/upload/route.ts), dan [`src/app/super-admin/update-promo/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/update-promo/page.tsx): seluruh parsing `xlsx` & logika upsert promo ~2.000+ baris di TypeScript/browser dihapus dan dialihkan 1 pintu ke Python Engine (`dispatchToGitHubRunner`).
  3. **Pensiunkan Hitungan Berat TS di Endpoint Admin:**
     - [`src/app/api/admin/clean-promo/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/clean-promo/route.ts): diganti menjadi 1 SQL `UPDATE` WIB + background `analytics` Python runner.
     - [`src/app/api/admin/po/generate/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/po/generate/route.ts): loop N+1 TS dihapus, diganti 1 query `INSERT ... SELECT` atomik + background `analytics` runner.
     - [`src/app/api/admin/promo-analysis/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/promo-analysis/route.ts) & [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts): memprioritaskan pembacaan pre-computed CDN JSON lewat `fetchStorageAnalyticsJson()` ([`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts)), serta menghilangkan `updateMany` promo expired di dalam GET `/sales-report`.
- **Verifikasi:** `python3.11 -m py_compile` (`run_admin_analytics.py`), `npx tsc --noEmit` (`0`), dan `npm run build` (`47/47` rute terkompilasi) lulus `exit code 0`.

---

### 91. Fitur Cek Promo Mendatang & Persiapan POP H-2 / H-1 (Terisolasi Total dari Promo Berjalan) (19 November 2026)

- **Kebutuhan Pengguna:** Memungkinkan crew dan supervisor mengecek promo baru yang sudah turun di H-2 / H-1 untuk persiapan ganti POP pajangan tanpa harus membuka file Excel satu per satu dan **tanpa merusak promo yang sedang berjalan di kasir**. (Sesuai arahan pengguna, perubahan disimpan lokal dan **belum di-push ke GitHub**).
- **Implementasi Terpadu:**
  1. **Mode `--upcoming` & Auto-Guard H-2/H-1 di Python ([`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py)):**
     - `extract_folder_date_info()` & `build_upcoming_promo_preview()` mem-parsing seluruh Excel promo mendatang secara *read-only* terhadap `"Product"`, membandingkannya dengan harga promo berjalan (`NEW_PROMO` | `PRICE_CHANGE` | `CONTINUED`), mengelompokkannya per Parent Artikel, dan mengunggah JSON terisolasi ke **`excel-uploads/analytics/upcoming-promo.json`**.
     - **Auto-Guard:** Bila sync promo normal mendeteksi folder tanggal mulai masa depan (`start_date > today_wib`) atau folder `UPCOMING`/`DRAFT`/`POP`, sistem otomatis mengalihkannya ke draf POP (`upcoming-promo.json`) dan mencegah penimpaan harga berjalan (kecuali `--force-apply`).
  2. **Workflow & Dispatcher (`upcoming-promo`) ([`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), [`/api/admin/trigger/github-dispatch`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts)):**
     - Menambahkan Kategori 6 `upcoming-promo` yang hanya menjalankan `run_promo_sync.py --upcoming` tanpa rebuild `Product`/`CatalogArticle`.
  3. **API & UI Crew Persiapan POP ([`src/app/api/promo-upcoming/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/promo-upcoming/route.ts), [`src/app/promo-mendatang/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/promo-mendatang/page.tsx), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), [`src/app/super-admin/update-promo/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/update-promo/page.tsx)):**
     - Halaman `/promo-mendatang` dilengkapi **Scanner Barcode Live (`TextScanner`)**, pencarian artikel/SKU/nama, filter **Toko (`SUKO`/`Mu+Ku`/`ZES`)**, filter **Perlu Ganti POP** (`Promo Baru` / `Harga Berubah`), filter **Stok > 0**, tampilan rincian warna/ukuran, tombol **Cetak Daftar POP (`window.print()`)**, serta panel upload Excel H-2 khusus Supervisor/Dev.
- **Verifikasi:** `python3.11 -m py_compile` (`run_promo_sync.py`), `npx tsc --noEmit` (`0`), dan `npm run build` lulus `exit code 0` (belum di-push ke remote sesuai instruksi).

---

### 92. Redesign UI/UX Logo Resmi Toko (`SUKO`, `Mu+Ku`, `ZES`), Ikon Kategori Vektor SVG, & Sapu Bersih Anti-Truncate Lintas Halaman (19 November 2026)

- **Kebutuhan Pengguna:** Mengganti tampilan filter toko yang sebelumnya berupa teks polos menjadi logo resmi toko dari folder `D:\Website\SUKO`, mengganti ikon kategori dari emoji teks menjadi ikon vektor SVG yang bersih, serta memastikan **tidak ada satu pun teks yang terpotong (`truncate` / `line-clamp-*`)** di seluruh halaman (`page.tsx` maupun halaman sekunder & admin).
- **Implementasi:**
  1. **Aset Logo Resmi Toko (`public/logos/`):**
     - Menyalin & mengoptimalkan logo resmi ke [`public/logos/suko.png`](file:///c:/Max%20Display/price-checker/public/logos/suko.png) (`17.284 B`), [`public/logos/muku.png`](file:///c:/Max%20Display/price-checker/public/logos/muku.png) (`5.516 B`), dan [`public/logos/zes.avif`](file:///c:/Max%20Display/price-checker/public/logos/zes.avif) (`2.368 B`).
  2. **Taksonomi & Kartu Brand Toko ([`src/lib/productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Menambahkan `logoUrl` & `textClass` pada `BrandGroupOption` dengan palet khas brand (`Navy #0E3A5D` untuk **SUKO**, `Terracotta #A54F2C` untuk **Mu+Ku**, `Obsidian slate-900` untuk **ZES**).
     - Merancang ulang switcher `Pilih Toko / Konsep` menjadi kartu berlogo resmi, pita sub-brand kontekstual (`SUKO` fabric-tech strip & `Mu+Ku` sub-brand strip), serta badge logo mini di `ProductCard` dan header detail artikel.
     - Menambahkan komponen ikon vektor `CategoryVectorIcon` (SVG murni) menggantikan emoji polos pada bar kategori.
  3. **Sapu Bersih Anti-Truncate Lintas Halaman (`whitespace-normal break-words`):**
     - Menghilangkan seluruh kelas pemotong teks (`truncate` / `line-clamp-*`) pada nama produk, judul promo, label warna/brand, ringkasan KPI, nama file, dan status di [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), [`src/app/promo-mendatang/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/promo-mendatang/page.tsx), [`src/app/promo-unik/ClientPromoCard.tsx`](file:///c:/Max%20Display/price-checker/src/app/promo-unik/ClientPromoCard.tsx), [`src/app/cek-harga/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/cek-harga/page.tsx), [`src/components/ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx), [`src/components/ImageLightboxModal.tsx`](file:///c:/Max%20Display/price-checker/src/components/ImageLightboxModal.tsx), [`src/components/TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx), [`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx), [`src/app/super-admin/promo-analysis/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/promo-analysis/page.tsx), [`src/app/super-admin/rekap-stok/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/rekap-stok/page.tsx), [`src/app/super-admin/saran-po/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/saran-po/page.tsx), [`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx), dan [`src/app/super-admin/update-promo/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/update-promo/page.tsx).
- **Verifikasi:** Audit scan `src/` (0 sisa kelas `truncate`/`line-clamp-*`), `npx tsc --noEmit` (`exit code 0`), dan `npm run build` (`exit code 0`) — seluruh perubahan **masih disimpan lokal (belum di-push ke GitHub)** menunggu instruksi user.

---

### 93. Perbaikan Total Live Stok MDS BISA StoreHub (`Auto-Login React 19 FormData`, Deteksi `HTTP 200` RSC Shell, & Turbo Bulk `All Warna & Size` 60/60 Varian) (19 November 2026)

- **Akar Masalah:**
  1. **Auto-Login StoreHub Gagal Diam-Diam & Deadlock Cookie Storage (`src/lib/mdsBisaClient.ts`, `python-engine/morning_full_sweep.py`):**
     - `FormData` menaruh `'0' = '[{},"$K1"]'` **sebelum** `_1_username` / `_1_password`. Parser streaming multipart React 19 (`decodeReplyFromBusboy`) memproses part `0` lebih dulu sehingga StoreHub menolak login dengan `"Username dan password wajib diisi."`.
     - Fallback `ACTION_LOGIN` usang (`6071833df0be708d73972db0a7dc0c7c83eb3d41f3` -> terbaru `603f9b4dfafaa0e65eec411a818c1ebcaa476b889f`).
     - Saat `forceRefresh = true`, `getStoreHubCookie` mengunduh cookie kedaluwarsa yang sama dari `secrets/mds_cookie.txt` Storage dan langsung me-return tanpa auto-login, serta tidak mengunggah cookie baru hasil auto-login kembali ke Storage.
  2. **`HTTP 200` RSC Shell Tidak Terdeteksi `authFailed`:** Ketika sesi ditolak tanpa HTTP 307, StoreHub dapat merender shell Next.js RSC (`$Sreact.fragment`, `ToastProvider`, `LoginForm`), sehingga dianggap item kosong lalu jatuh diam-diam ke `fallbackToDb()` (menampilkan stok lama).
  3. **Bottleneck 20+ Detik & Terpotong 13 SKU pada `syncAllSizes`:** StoreHub `item-checker` tidak lagi mengirim field `relatedStock`, sehingga semua sibling melalui Step 4 (`syncAllSizes`) yang memanggil `upsertStoreHubItemToDb()` (`4` round-trip Prisma per SKU = `~20 detik` untuk Batch 1 berisi 12 SKU) dan terhenti di budget `5.500ms`. Akibatnya artikel `20 SKU` (`W2L935G4`) & `60 SKU` (`P1M34353`) terpotong di **13 SKU** (`7`–`47` varian sisanya tidak tersinkron!), sementara `/api/live-stock` belum memasang `export const maxDuration = 60;`.
  4. **Sinkronisasi Cache UI Lokal (`src/lib/offlineDb.ts`, `src/app/page.tsx`):** `updateLocalFamilyStockInMemory` belum memperbarui `articleTotalStok` pada `memoryModelsCache`/`db.models`, `handleCheckLiveStock()` belum memperbarui `productsList` + `listCacheRef`, dan `catch` error menampilkan pesan seolah-olah normal (`"Menampilkan stok tersimpan di sistem"`).

- **Perbaikan yang Diterapkan:**
  1. [`src/app/api/live-stock/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/live-stock/route.ts): Menambahkan `export const maxDuration = 60;` agar serverless Vercel tidak timeout pada artikel besar (`20–60` varian).
  2. [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) & [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py):
     - Memperbarui `ACTION_LOGIN` default ke `603f9b4dfafaa0e65eec411a818c1ebcaa476b889f` dan memindahkan field `_1_*` **sebelum** `'0'` di `FormData` multipart.
     - `getStoreHubCookie(forceRefresh, previousCookie)` melewatkan cookie Storage jika sama dengan `previousCookie`, mengeksekusi auto-login StoreHub, serta langsung mengunggah cookie `mso_session=` baru ke `excel-uploads/secrets/mds_cookie.txt`.
     - Menambahkan `resolveDetailActionHash()` + deteksi RSC shell / error auth pada `queryStoreHubDetail()` + pemulihan retry otomatis.
     - **Turbo Bulk `syncAllSizes` (`DIRECT_BATCH = 20`, budget `15.000ms`):** Memprioritaskan warna aktif terlebih dahulu, me-refresh cookie sekali jika terkena `authFailed` di tengah batch, serta langsung mengeksekusi `prisma.product.updateMany` paralel per kelompok nilai stok **hanya untuk SKU yang stoknya benar-benar berubah** + menghitung metrik akurat `liveCheckedCount` dan `changedCount`.
  3. [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts) & [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx): Memperbarui `articleTotalStok` di `memoryModelsCache` + `db.models`, `productsList`, mengosongkan `listCacheRef`, dan menampilkan jumlah varian dicek (`liveCheckedCount`) serta yang berubah (`changedCount`) maupun error jaringan secara jujur.

- **Verifikasi Nyata (Lokal sebelum push):**
  - **Tes Auto-Login StoreHub (`getStoreHubCookie(true, 'mso_session=expired_dummy_test_000')`):** Berhasil dalam **`1.877 ms`** (`len=1339`, `hasMsoSession=true`) dan tersimpan ke Supabase Storage.
  - **Tes Full-Article `W2L935G4` (SKU `77997729`, `20` SKU):** `liveCheckedCount = 20/20`, `changedCount = 5` SKU diperbarui langsung di Postgres, `storeOffline = false`, durasi `19.252 ms`.
  - **Tes Full-Article `P1M34353` (SKU `18721216`, `60` SKU):** `liveCheckedCount = 60/60`, `changedCount = 25` SKU diperbarui langsung di Postgres, `storeOffline = false`, durasi `24.348 ms`.
  - `py_compile` (`morning_full_sweep.py`), `npx tsc --noEmit` (`0`), dan `npm run build` lulus `exit code 0` (disimpan lokal — menunggu konfirmasi user untuk push GitHub/deploy Vercel).

---

### 94. Python Guardian Live Console Stream, Audit Produk Baru Ter-Add ke DB, & Sistem Auto-Diagnostik + Self-Healing Auto-Retry (19 November 2026)

- **Kebutuhan Pengguna:**
  1. Menampilkan jumlah **produk baru yang benar-benar ter-add ke database** saat menjalankan scrab/sinkronisasi.
  2. Menghadirkan **Console Log Output asli baris per baris** pembacaan eksekusi Python/GitHub Actions di [`/super-admin/sinkronisasi-harian`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx), bukan sekadar 4 baris ringkasan statis.
  3. Membangun **sistem deteksi bug/error + Self-Healing + Auto-Retry otomatis** yang mampu memperbaiki kendala (seperti sesi cookie kedaluwarsa, modul hilang, rate-limit Gemini AI, atau gangguan koneksi DB/jaringan) dan mengulang program trigger sampai sukses.

- **Implementasi Terpadu:**
  1. **Python Guardian Engine ([`python-engine/runner_guardian.py`](file:///c:/Max%20Display/price-checker/python-engine/runner_guardian.py), [`python-engine/ai_helper.py`](file:///c:/Max%20Display/price-checker/python-engine/ai_helper.py), [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml)):**
     - `--init-run` & `--track-new-products` mencatat baseline `MAX(id)` B-Tree primary key pada tabel `"Product"` di awal workflow lalu menghitung tepat berapa `+SKU Baru` & `+Artikel Baru` (`WHERE id > baseline_max_id`, nol full-table scan) beserta 12 sampel produk terbaru.
     - Menjalankan skrip Python melalui `subprocess.Popen` (`PYTHONUNBUFFERED=1`), menyaring kredensial (`sanitize_log_line`), mengklasifikasikan level warna (`error`, `warn`, `heal`, `db`, `success`, `info`), dan mengunggah stream log real ke Supabase Storage `excel-uploads/logs/live-runner-log.json` setiap `3.5s`.
     - **Mesin Diagnostik & Self-Healing (`diagnose_output` + `attempt_self_heal`):** Mendeteksi `Traceback` Python (`file:line`, `exceptionType`, `exceptionMsg`) serta mengklasifikasikan `AUTH_EXPIRED` (auto-login ulang React 19 `_1_*`-sebelum-`'0'` ke StoreHub + upload ke `secrets/mds_cookie.txt`), `MISSING_DEPENDENCY` (`pip install -r requirements.txt`), `GEMINI_QUOTA_OR_503` (set `SKIP_GEMINI_AI=1` bypass ke fast-path deterministik di `ai_helper.py`), `DB_OR_NETWORK_TRANSIENT` (exponential backoff + uji `SELECT 1`), `STORAGE_OR_FILE_CORRUPT`, `STORE_OFFLINE`, dan `CODE_EXCEPTION` — lalu otomatis mengulang step hingga `--max-retries 3`.
  2. **Backend Monitoring & Self-Heal API ([`src/app/api/admin/trigger/github-status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-status/route.ts), [`src/app/api/admin/trigger/self-heal/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/self-heal/route.ts)):**
     - `/api/admin/trigger/github-status` membaca `logs/live-runner-log.json` saat run aktif/baru, atau fallback ke GitHub Job Raw Logs API (cached `5` menit) + ekstraksi diagnostik & `newSkusAdded`/`newArticlesAdded` pada `SyncHistory` + hitungan DB O(1) via `pg_class.reltuples`.
     - `POST /api/admin/trigger/self-heal` memaksa pembaruan cookie StoreHub (`getStoreHubCookie(true)`) jika diperlukan oleh `action` lalu men-dispatch ulang GitHub Actions secara aman.
  3. **UI Real Console, Audit Produk Baru, & Auto-Ulang Frontend ([`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx)):**
     - Banner **Audit Produk Baru Ter-Add di Database** (`+SKU Baru`, `+Artikel Baru`, `Total DB`, dan drawer sampel produk baru) + Card 1 terhubung ke `dbMetrics.totalProducts` real.
     - Tabel **Riwayat Eksekusi** dilengkapi kolom khusus **`Produk Baru (+Add)`**.
     - Panel **Guardian Auto-Diagnostik, Self-Heal & Auto-Ulang Trigger** (`Auto-Ulang Saat Error ON/OFF` maks `3x`, hitung mundur 8 detik dengan tombol `Batalkan`, tombol 1-klik `Benahi & Ulangi`, daftar `Self-Healing` yang diterapkan, serta detail error & snippet `Traceback`).
     - Terminal **Console Log Output Asli** menampilkan stream baris demi baris dengan tab filter (`Semua`, `Error / Bug`, `Self-Heal`, `DB / Produk Baru`), pencarian teks, `Auto-Scroll ON/OFF`, `Salin Log`, dan anti-truncate penuh (`whitespace-pre-wrap break-words`).

- **Verifikasi Nyata (Lokal sebelum push):**
  - `py_compile` (`runner_guardian.py`, `ai_helper.py`, `morning_full_sweep.py`) lulus (`PY_COMPILE_OK`).
  - **Smoke Test Langsung `runner_guardian.py` (`Run #991`):**
    - `Smoke Step 1` mencatat baseline DB real (`309,956 SKU`, `MAX id=700,621`), menyiarkan stream ke Storage JSON (`HTTP 200`), dan melaporkan hasil DB Audit.
    - `Smoke Step 2 Retry` mensimulasikan `ConnectionError: temporary network glitch` di percobaan #1 -> terdiagnosa `DB_OR_NETWORK_TRANSIENT` -> `[SELF-HEAL] Cooldown jaringan 12s selesai (Koneksi DB terverifikasi pulih)` -> `[AUTO-RETRY #2]` -> sukses (`exit code 0`, `diagnosticsCount=1`, `healsAppliedCount=1`), dan file smoke test dibersihkan dari Storage (`HTTP 200`).
  - Audit zero-truncate pada `sinkronisasi-harian/page.tsx` bersih (`0` temuan), `npx tsc --noEmit` (`0`), dan `npm run build` lulus `exit code 0` (disimpan lokal — menunggu konfirmasi user untuk push GitHub/deploy Vercel).

---

### 95. Tombol Trigger Khusus `📸 Update Gambar` & Mesin Sinkronisasi Foto Per-Warna Anti-Salah-Warna (`Matahari.com + Direct CDN Probe`) (19 November 2026)

- **Masalah dari Laporan & Screenshot Pengguna (`W2L935G4` `CELANA PANJANG TWILL PANTS LIP`):**
  1. Saat klik warna atau menekan `Live Stok`, jika salah satu SKU warna sudah terisi foto fallback dari warna lain (misal `VANILLA S/M/XL` di `W2L935G4` berisi foto `OFF WHITE` `54714282-1.jpg` padahal `54714344-1..5.jpg` milik `VANILLA` tersedia di CDN Shopify), sistem lama hanya memeriksa `!sib.imageUrl` sehingga menganggap foto sudah lengkap dan **tidak mencari ulang foto yang benar sesuai warna**.
  2. `fetchMatahariFamilyAndImages()` hanya menanyakan 1 `seedSku` / `article` / `seedBarcode` ke `matahari.com/search/suggest.json` (yang gagal bila SKU batch lama tidak diindeks oleh predictive search Matahari, tanpa mencoba SKU warna lain atau kata kunci `brand + nama produk` maupun `HEAD` langsung ke `${sku}-1..5.jpg` di Shopify CDN), serta belum ada tombol manual khusus **`📸 Update Gambar`** untuk memaksa perbaikan foto kapan saja.

- **Perbaikan yang Diterapkan:**
  1. **Mesin Foto Per-Warna + Proteksi Kepemilikan SKU ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts)):**
     - Menambahkan `normalizeRetailColorKey()`, `extractSkuFromShopifyUrl()` (mendeteksi prefix SKU `7–9` digit pada nama file URL Shopify), dan `buildMatahariKeywordQueries()`.
     - **Jalur 1 (`fetchMatahariFamilyAndImages`):** Multi-query hingga `4` SKU perwakilan warna berbeda + keyword `brand + nama produk`, mencocokkan variasi terhadap seluruh SKU/barcode keluarga, memetakan galeri multi-angle (`-1..8`) ke setiap varian & warna ternormalisasi (`normalizeRetailColorKey`), serta ikut dipanggil oleh `Live Stok` (`finalizeProductFamilyResponse`).
     - **Jalur 2 (Direct Shopify CDN `HEAD` Probe):** Mem-probe langsung `cdn.shopify.com/.../files/${sku}-1..5.jpg` dengan prioritas `targetColor` untuk warna-warna yang belum tertangkap `suggest.json`.
     - **Pemulihan Ketat `healProductImagesInDb()`:** Memvalidasi pemilik SKU pada setiap URL foto (`existingTrueColorGalleries`), **menolak URL yang milik SKU warna berbeda**, memperbarui seluruh size warna yang sama secara serentak, memperbarui `CatalogArticle`, serta melaporkan secara jujur `updatedCount`, `matchedColors`, `unmatchedColors`, dan `activeColorMatched`.
  2. **API & UI Tombol Trigger Khusus `📸 Update Gambar` ([`src/app/api/product/heal-image/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/heal-image/route.ts), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Endpoint `POST /api/product/heal-image` (`maxDuration = 30`) mendukung `{ targetColor, force }`.
     - Halaman detail produk kini mendeteksi **ketidakcocokan warna foto** (`mismatchedOwnerColor`: contoh saat membuka `COBALT BLUE` tetapi foto yang tampil masih milik SKU `OFF WHITE`), memprioritaskan galeri saudara se-warna di `heroImages`, menampilkan banner informasi **`Foto tampil milik warna ... (belum sinkron dengan ...)`** dengan tombol cepat **`📸 Cari & Sinkron Foto`**, serta menempatkan tombol trigger khusus **`📸 Update Gambar`** tepat di samping **`⚡ Live Stok`**.

- **Verifikasi Nyata (Lokal sebelum push):**
  - **Uji Kasus Nyata `W2L935G4` (`sku: '54714335'`, `targetColor: 'VANILLA'`):**
    - Berhasil memulihkan **`6` varian** dalam `13.122 ms`: seluruh size `VANILLA` (`S/M/L/XL`) kini memakai foto `VANILLA` resmi (`54714344-1.jpg`, `5` angle), seluruh size `OFF WHITE` (`S/M/L/XL`) memakai `54714282-1.jpg` (`5` angle), serta jujur melaporkan `unmatchedColors: ['COBALT BLUE', 'DARK BROWN', 'DARK GREY']` karena ketiga warna tersebut belum diunggah ke Shopify CDN Matahari.com (`mismatchedOwnerColor` terdeteksi otomatis di UI).
  - **Uji Artikel Multi-Warna Live `W2L374G3` (`sku: '22433190'`):** `matchedColors` memetakan penuh `6/6` warna (`BLACK`, `CACTUS GREEN`, `CHARCOAL`, `COBALT BLUE`, `SAND`, `VANILLA`, `unmatchedColors: []`) dalam `2.859 ms`.
  - Audit zero-truncate pada `src/app/page.tsx` bersih (`0`), `npx tsc --noEmit` (`0`), dan `npm run build` lulus `exit code 0` (semua perubahan masih disimpan lokal — menunggu konfirmasi user untuk push GitHub).

---

### 96. Kunci Ketat Login `1 Akun = 1 Device` & Fitur **Logout All Device** (Termasuk Akun Developer `22054178`) (19 November 2026)

- **Kebutuhan Pengguna:**
  1. Memastikan jika sebuah akun sudah login di satu perangkat, akun tersebut **tidak dapat dipakai login di perangkat lain** sebelum benar-benar logout (mencegah pemakaian 1 akun di banyak perangkat secara bersamaan maupun bypass *force-login*), berlaku menyeluruh untuk `CREW_STORE`, `SUPERVISOR`, hingga akun Developer (`22054178`).
  2. Menyediakan fitur **Logout All Device** yang sanggup mengeluarkan seluruh perangkat aktif **termasuk akun Developer (`22054178`)**.

- **Perubahan Arsitektur & Endpoint:**
  1. **Kunci Ketat Login `1 Akun = 1 Device` ([`src/app/api/auth/login/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts)):**
     - Menghapus bypass `force: true` serta pengecualian `user.nik !== "22054178"`.
     - Jika akun memiliki `sessionId` aktif (`status !== "OFFLINE"`, usia sesi `< 24 jam`, dan shift belum kedaluwarsa untuk non-Supervisor/non-Dev), login hanya diizinkan jika request membawa cookie `token` dari **perangkat yang sama** (`existingSession.userId === user.id && existingSession.sessionId === user.sessionId`). Selain itu ditolak **HTTP `409`** (`isAlreadyLoggedIn: true, strictLocked: true, lastActive, canDeveloperLogoutAll: user.nik === "22054178"`).
     - Menambahkan `path: "/"` eksplisit pada penulisan cookie `token`.
  2. **Validasi Sesi Global Tanpa Pengecualian ([`src/app/api/auth/me/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/me/route.ts), [`src/app/api/auth/status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/status/route.ts), [`src/app/api/auth/logout/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/logout/route.ts)):**
     - Menghapus pengecualian `isSuperOrDev` di `/api/auth/me` sehingga apabila `sessionId` dihapus/diganti atau `status === "OFFLINE"`, **seluruh role termasuk `SUPERVISOR` dan Developer (`22054178`)** langsung ditendang (`kickedOut: true`, `reason: "logged_out_all"` atau `"device_switched"`, cookie dibersihkan).
     - `/api/auth/status` menolak perangkat yang sesinya sudah dihentikan dengan HTTP `401`; `/api/auth/logout` menutup semua shift terbuka via `updateMany` dan menghapus cookie `token` + `sessionId`.
  3. **Endpoint Terpadu `POST /api/auth/logout-all` ([`src/app/api/auth/logout-all/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/logout-all/route.ts)):**
     - `scope: "self"`: mengeluarkan seluruh perangkat milik akun sendiri (tersedia untuk semua role).
     - `scope: "user"`: `SUPERVISOR` / Developer memaksa logout pengguna tertentu (`targetUserId`) untuk membuka kunci perangkat yang tertinggal.
     - `scope: "all"`: `SUPERVISOR` / Developer mengeluarkan **seluruh user tanpa pengecualian termasuk Developer `22054178`** (`prisma.shift.updateMany` + `prisma.user.updateMany({ data: { sessionId: null, status: "OFFLINE" } })`) beserta pencatatan `LoginLog`.
     - `scope: "developer_recovery"`: katup pengaman darurat pada `/login` khusus NIK `22054178` dengan PIN valid (menolak NIK lain dengan HTTP `403`).
  4. **Penegakan Sesi Lintas Halaman & Guard Anti-Loop ([`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts), [`src/components/LayoutWrapper.tsx`](file:///c:/Max%20Display/price-checker/src/components/LayoutWrapper.tsx), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - `middleware.ts` mengecualikan `/api/auth/logout-all` dan membersihkan cookie jika user menuju `/login?reason=logged_out_all|device_switched|session_expired_cart_saved|shift_ended` agar tidak terjadi redirect loop.
     - `LayoutWrapper.tsx` mengecek `/api/auth/me` tiap `20s`, saat tab kembali `visible`/fokus, dan saat `reconnect` — menendang seluruh halaman (`/super-admin/*`, `/warehouse`, `/profile`, `/spv-gateway`, `/promo-mendatang`, dll.) jika `kickedOut` atau `reason === "logged_out_all"`.
  5. **Antarmuka UI Tanpa Pemotongan Teks ([`src/app/login/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/login/page.tsx), [`src/app/super-admin/users/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/users/page.tsx), [`src/app/profile/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/profile/page.tsx), [`src/components/Sidebar.tsx`](file:///c:/Max%20Display/price-checker/src/components/Sidebar.tsx)):**
     - `/login`: mengganti modal bypass `Ya, Lanjutkan` menjadi modal kunci ketat **`Akun Aktif di Perangkat Lain (1 Akun = 1 Device)`** + opsi pemulihan 2-langkah khusus Developer `22054178`.
     - `/super-admin/users`: tombol merah **`Logout All Device`** di header, badge **`Sesi Terkunci (Belum Logout)`** saat offline namun masih memegang `sessionId`, serta tombol **`Paksa Logout`** per baris.
     - `/profile` & `Sidebar.tsx`: akses langsung ke **`Profil & Keamanan Akun`** (`Logout Semua Perangkat (Akun Saya)`) serta **`Logout All Device (Semua + Dev)`** bagi `SUPERVISOR` & Developer.

- **Verifikasi Nyata (Lokal sebelum push):**
  - **Audit Zero-Truncate** pada 6 file TSX termodifikasi: `0` temuan (`ZERO_TRUNCATE_OK`).
  - **`npx tsc --noEmit`** & **`npm run build`**: `47/47` rute (termasuk `ƒ /api/auth/logout-all`) lulus `exit code 0`.
  - **Uji E2E HTTP Live (`verify_auth_lock.mjs` terhadap Next production server port `3199` & PostgreSQL menggunakan akun uji sementara):** seluruh 7 skenario lulus (`ALL_AUTH_E2E_CHECKS_PASSED`: login 200, penolakan perangkat ke-2 meski `force: true` dengan HTTP 409, same-device login 200, lock & tendang `SUPERVISOR` via `/api/auth/me`, `logout-all` `user` & `self` menutup shift + menolak `/api/auth/status` 401 + mengizinkan re-login, penolakan HTTP 403 `developer_recovery` untuk non-Dev, dan guard anti-loop middleware di `/login?reason=logged_out_all`), dan seluruh data uji dibersihkan kembali (belum di-push ke GitHub).

---

### 97. Upgrade Auto-Guard Promo H-2 / H-1 Menjadi Deteksi Otomatis 3 Lapis (Termasuk Jalur Single-File Gmail GAS) (19 November 2026)

- **Kebutuhan & Temuan Audit:**
  - Google Apps Script ([`scripts/gas_supabase_uploader.js`](file:///c:/Max%20Display/price-checker/scripts/gas_supabase_uploader.js)) memanggil `/api/upload/sync-latest-blob` satu per satu per lampiran email (jalur `--file=<url>`), sedangkan Auto-Guard lama hanya membaca tanggal dari Subject email (nama folder) pada jalur batch sehingga berisiko membocorkan promo H-2 ke harga kasir apabila Subject email tidak mencantumkan tanggal atau dikirim lewat webhook single-file.

- **Perbaikan yang Diterapkan:**
  1. **Deteksi Otomatis 3 Lapis & Proteksi Baris Campuran ([`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py)):**
     - Menambahkan `_safe_encode_url()`, `_sanitize_temp_filename()`, `_normalize_iso_date()` (mendukung `YYYY-MM-DD` dan `DD/MM/YYYY` ritel Indonesia), `_extract_storage_folder_from_url()`, `_list_files_in_promo_folder()`, serta `_preload_files_for_guard()` / `_cleanup_expired_promos_wib()`.
     - Memperkuat `extract_folder_date_info()` agar mengenali tanggal periode kompak tanpa spasi pada nama file Excel (mis. `05-11NOV2026`, `26NOV-02DES2026`) sekaligus mengabaikan angka nomor urut depan (`18. PROMO ...`), kode departemen (`3366`), dan `WEEK45` / `W47`.
     - Memperkenalkan **`detect_promo_launch_window()`** (3 Lapis): **Lapis 1** membaca kolom `tgl_mulai` pada baris promo di dalam isi Excel; **Lapis 2** membaca periode pada nama file Excel; **Lapis 3** membaca tanggal/tag pada Subject email (nama folder Storage). Diterapkan ke **kedua jalur**: single-file `--file=<url>` dari GAS maupun batch folder + fallback `PROMO/`, dilengkapi guard baris campuran pada `process_single_promo_file()` (melewati baris `tgl_mulai > today_wib` kecuali `--force-apply`).
     - Saat jalur `--file=<url>` mendeteksi promo masa depan, sistem otomatis mengumpulkan seluruh file di folder `PROMO/<Subject>/` yang sama dan mengompilasi draf POP terpadu ke `analytics/upcoming-promo.json` tanpa menyentuh tabel `Product` berjalan.
  2. **Perbaikan Encoding URL Berspasi & Quoting Workflow ([`src/app/api/upload/sync-latest-blob/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/upload/sync-latest-blob/route.ts), [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml)):**
     - Menormalisasi `promoUrl` (`safeNormalizeUrl`) dan meng-quote `"--file=$PROMO_URL"` di Kategori 3 (`promo`) serta Kategori 6 (`upcoming-promo`) agar URL Storage yang mengandung spasi dari Subject email tidak pernah terpecah oleh shell runner.
     - Skrip Google Apps Script (`Kode.gs`) **tidak perlu diubah**.

- **Verifikasi Nyata (Lokal sebelum push):**
  - `python-engine\.venv\Scripts\python.exe -m py_compile python-engine\run_promo_sync.py`: lulus (`PY_COMPILE_OK`).
  - Uji otomatis `test_promo_guard_3layer.py`: seluruh kasus lolos (`ALL_AUTO_GUARD_3LAYER_TESTS_PASSED`), termasuk `05-11NOV2026`, `26NOV-02DES2026`, `26/11/2026`–`02/12/2026`, Subject tanpa tanggal, folder `MANUAL_2026-11-19`, serta pembacaan read-only file Excel nyata `18. PROMO 3366 SUKO CHILDREN BOYS 19-25 NOV 2026 W47 ALLSTORE.xlsx` (`814` SKU).
  - `npx tsc --noEmit` (`TSC_OK`) dan `npm run build` (`47/47` rute, `BUILD_OK`) lulus `exit code 0` (disimpan lokal — menunggu konfirmasi `"push github"` dari user).

---

### 98. Perbaikan Bug `755 Artikel` Saat Barcode Belum Ada, Notice Notifikasi Instan, & Trigger Langsung Scrap MDS BISA + Matahari.com (`2340002272943`) (19 November 2026)

- **Akar Masalah dari Laporan & Screenshot Pengguna (Barcode `2340002272943` menampilkan `HASIL PENCARIAN: 755 ARTIKEL`):**
  1. Di [`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts) (`computeProductRelevanceScore`), bonus unconditional **`+25` (stok > 0), `+12` (`imageUrl`), dan `+10` (`hargaNormal >= 5000`)** menghasilkan skor minimum `47` (`>= 35`) meski query sama sekali tidak cocok (`score` awal = `0`), lalu di [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts) (`queryLocalModelsInstant`) angka `"2340002272943"` jatuh ke pengecekan awalan `sub3 = "234"` dan menyeret `755` artikel yang memiliki `stok > 0`, foto, & harga normal.
  2. Akibatnya alur tidak pernah mencapai status `Not Found` dan menyembunyikan kartu Notice & tombol **Scrap MDS BISA & Matahari.com**.

- **Perbaikan yang Diterapkan:**
  1. **Eliminasi Skor Palsu & Fuzzy Barcode ([`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts)):**
     - `computeProductRelevanceScore` langsung mengembalikan `0` apabila kecocokan teks/kode `<= 0` sebelum menghitung tie-breaker stok/foto/harga.
     - `queryLocalModelsInstant` menambahkan pemeriksaan kandidat normalisasi nol-depan serta menghentikan *fallback* substring `sub3`/bigram untuk kode digit panjang `^\d{8,20}$` (mengembalikan `baseMatched = []` bila tidak ada *exact match*).
  2. **Notice Notifikasi + Kartu Aksi 1-Klik Tanpa Truncate ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Mengabaikan query model fuzzy lokal pada pencarian barcode `8–20` digit (`shouldQueryModels = !isPureLongDigitCode && ...`).
     - Saat kode belum ada di DB offline/server, otomatis mengosongkan daftar hasil lama (`showBarcodeNotFoundNotice`), memunculkan toast notifikasi (`showToast(..., "info")`), serta menampilkan kartu Notice **`Barcode / Kode "..." Belum Ada di Database`** lengkap dengan tombol utama **`Cari Barcode & Gambar Sekarang (Scrap MDS BISA + Matahari)`** (`includeFamily = true`) dan **`Scrap Cepat Kode "..." + Foto`** (`includeFamily = false`), seluruh teks bebas pemotongan (`whitespace-normal break-words`).
  3. **Pengayaan Foto Saat Discovery Produk Baru ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts)):**
     - `checkSingleItemStock` langsung meneruskan `{ brand, description, targetColor, probeDirectCdn: true }` ke `fetchMatahariFamilyAndImages`, dan `finalizeProductFamilyResponse` mengecek warna saudara yang belum memiliki foto (`hasUncoveredColor`) untuk menarik galeri per warna dari Matahari.com / Shopify CDN.

- **Verifikasi Nyata (Lokal sebelum push):**
  - Audit zero-truncate `src/app/page.tsx` (`0`), `npx tsc --noEmit` (`TSC_OK`), dan `npm run build` (`47/47` rute, `BUILD_OK`) lulus `exit code 0`.
  - **Uji Unit `computeProductRelevanceScore`:** `'2340002272943'` terhadap produk tidak cocok (`stok: 14`, berfoto) mengembalikan **`0`** (bukan `47`), sementara query valid `'kaos'` mengembalikan `132`.
  - **Uji HTTP Live Server Lokal (`port 3198`):**
    - Sebelum scrap: `GET /api/product/2340002272943?fast=1` maupun tanpa `?fast=1` keduanya mengembalikan **HTTP `404`** (bukan `755` artikel).
    - **Uji Scrap Langsung `POST /api/live-stock` (`2340002272943`):** Berhasil ditemukan live di StoreHub Toko 719 sebagai **SKU `13472861`** (`T1KT1351`, `T-SHIRT SS ROUND NECK KERAH BU`, `PASTEL GREEN` / `S`, `stok: 26 pcs`, `hargaNormal: 129.900`, `78` varian artikel), menyedot penuh **`5` foto studio Shopify CDN** (`13472861-1..5_*.jpg`), dan otomatis menyimpan alias baru **`BarcodeAlias` `2340002272943 -> sku 13472861` (`source: MDS_LIVE`)** ke PostgreSQL Supabase (semua kode tetap lokal menunggu instruksi `"push github"`).


---

### 99. Persistensi Penuh Barcode Alias Hangtag ke IndexedDB Dexie (`db.aliases`), Resolusi 0ms Offline, & Eliminasi Abort Timeout Server (19 November 2026)

- **Masalah dari Laporan & Screenshot Pengguna (`2340002272943`):**
  Pengguna menanyakan: *"ini sudah bisa muncul. terus aku cari lagi malah ga nemu lagi hmmm. loh kan muncul terus ga nyimpan apa di data base dan db offline ? ini aku lewat upload foto untuk mencarinya. lanjutkan"*.
  Setelah foto diupload dan barang berhasil tersedot (SKU `13472861`, `T-SHIRT SS ROUND NECK KERAH BU`, `78` varian, `26 pcs`, 8 foto studio), saat dicari ulang via ketik barcode hangtag `2340002272943`, sistem kembali menampilkan *"Barcode tidak ditemukan di database offline"*.

- **Akar Masalah Nyata (Forensik Teliti):**
  1. **Tabel IndexedDB `db.aliases` di Browser Klien Tidak Pernah Disimpan oleh `persistServerFamilyToLocal`:**
     - `persistServerFamilyToLocal` sebelumnya hanya melakukan `db.products.bulkPut(deduped)` ke tabel `products`.
     - Barcode hangtag fisik `2340002272943` adalah barcode alias sekunder untuk SKU `13472861` (barcode primer di katalog adalah `2340000762811`).
     - Karena tabel `db.aliases` tidak pernah diisi saat produk baru tersimpan, maka pencarian berikutnya di HP (`findOfflineProductByCode("2340002272943")`) mengembalikan `null`!
  2. **False Abort `1800ms` & Banner "Tidak Ditemukan" Prematur:**
     - Di `src/app/page.tsx`, ketika HP kasir sudah memegang data offline (`localDbReady = true`), sistem langsung memanggil `showBarcodeNotFoundNotice` di depan (sebelum server merespon).
     - Kemudian sistem menembak `/api/product/2340002272943?fast=1` dengan timeout `1.800ms`.
     - Karena artikel memiliki `78` varian (`116 KB` JSON), waktu transmisi jaringan toko membutuhkan `~2.700ms`. Akibatnya `fastCtrl.abort()` langsung memutus koneksi di detik ke `1.8`, sehingga respon sukses dari server terbuang dan banner not found tetap menempel di layar!
  3. **Respon Server Belum Mengirim Seluruh BarcodeAlias Keluarga:**
     - Endpoint `GET /api/product/[identifier]` dan `POST /api/live-stock` sebelumnya belum mengembalikan field `aliases: [...]`, sehingga browser tidak mengetahui ada 27 barcode hangtag fisik lain milik keluarga artikel tersebut.

- **Perbaikan yang Diterapkan:**
  1. **Mesin Persistensi Terpadu Offline DB ([`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts)):**
     - Menambahkan fungsi `persistFamilyToLocalDb` & `ensureFamilyInLocalModels`:
       - Menyimpan seluruh varian ke `db.products`.
       - Menyimpan seluruh barcode alias (dari `searchedCode`, `serverAliases`, dan seluruh barcode varian saudara) ke `db.aliases`.
       - Membangun model artikel via `sanitizeAndIndexModel` ke `db.models` dan memperbarui `memoryModelsCache` di RAM secara instan.
     - `findOfflineProductByCode` kini seketika menemukan alias hangtag (`aliasHit.sku -> aliasedProd`) dalam **`0ms` secara offline**.
  2. **Penyertaan Lengkap BarcodeAlias Keluarga di Server ([`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts), [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts)):**
     - `GET /api/product/[identifier]` dan `POST /api/live-stock` kini mengambil seluruh `BarcodeAlias` keluarga artikel dari Supabase dan menyertakannya di payload respon (`aliases: familyAliases`).
  3. **Eliminasi Abort Prematur & Auto-Save di Klien ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Memperbarui `persistServerFamilyToLocal` untuk menerima `aliases` dan memanggil `persistFamilyToLocalDb`.
     - Pada `searchProduct`:
       - `0A. Cek Sibling Langsung`: jika barcode atau alias cocok dengan produk aktif / `sessionCacheRef`, langsung tampil seketika (`0ms`).
       - Pencarian kode yang belum ada di offline DB kini menampilkan loading cepat dan memberi waktu `4.500ms` ke server. Jika server menemukan data, langsung ditampilkan dan otomatis di-cache permanen ke `db.aliases` + `db.products`. Banner "Belum Ada di Database" hanya muncul jika server benar-benar merespon 404.

- **Verifikasi Nyata:**
  - `npx tsc --noEmit`: Lulus `0` error (`TSC_OK`).
  - `npm run build`: `47/47` rute terkompilasi sempurna (`BUILD_OK`).
  - Uji `scripts/verify_alias_fix.mjs`: terverifikasi `BarcodeAlias` untuk `2340002272943` dan `27` barcode alias keluarga `T1KT1351` 100% cocok dan terindeks di Supabase.
  - Zero-truncate audit: `0` pelanggaran kelas pemotong teks.

---

### 100. Eliminasi Total Badge "PROMO" Palsu pada Varian Harga Normal (`NORMAL PRICE`), Pembersihan 2.822 Baris DB, & Proteksi Lintas Pipeline (19 November 2026)

- **Masalah dari Laporan & Screenshot Pengguna (`T1KT1351`):**
  Pengguna mengunggah tangkapan layar artikel `T1KT1351` dan memberi instruksi: *"Tolong dong ini kalau normal ya jangan ada promonya"*.
  Pada varian warna **AQUA**, sistem menampilkan harga promo `Rp 59.000` (SP59 - benar). Namun pada varian warna **BLACK**, sistem menampilkan stok dengan badge merah **`PROMO`**, padahal warna BLACK adalah barang harga normal (`Rp 129.900`) tanpa diskon apapun.

- **Akar Masalah Nyata (Forensik Multi-Lapisan):**
  1. **Kebocoran Nama Sheet Excel di Pipeline Ingesti Python ([`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py)):**
     - File promo Excel sering memiliki sheet bernama `"NORMAL PRICE"` atau `"NORMAL"`. Parser (`parser.py`) menandai `is_promo = False`.
     - Namun di `run_promo_sync.py` (baris 591 lama): `"acara": item.get("acara") or item.get("sumber_sheet")`. Nilai `sumber_sheet` (`"NORMAL PRICE"`) tetap ditulis ke kolom `acara` meskipun barang bukan promo!
     - Akibatnya sebanyak **2.822 produk** di tabel `Product` Supabase terisi `acara = "NORMAL PRICE"` dengan `hargaPromo = null` / `0`.
  2. **Pengecekan Promo Varian Tercampur dengan Flag Artikel & Teks Acara ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Fungsi `isVariantPromoActiveClient` sebelumnya memeriksa: `Boolean(hasPrice || item.diskon || item.discountType || item.acara || item.articleHasPromo)`.
     - Karena `item.acara` berisi string `"NORMAL PRICE"`, nilainya truthy!
     - Lebih dari itu, `item.articleHasPromo` adalah flag level artikel/keluarga. Karena ada varian saudara (AQUA) yang promo, maka seluruh varian saudara (termasuk BLACK) ikut terimbas menjadi promo aktif!
     - Pada kartu ukuran warna, jika varian aktif promo tapi tidak memiliki `hargaPromo` lebih murah (`hasPromoPrice = false`), sistem menampilkan fallback teks badge **`PROMO`** berwarna merah!
  3. **Ketidaksinkronan di Offline DB & Server Query Helpers ([`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts)):**
     - `isLocalPromoActive` dan `isItemPromoActive` juga mengecek `m.acara` dan `m.articleHasPromo` tanpa memfilter istilah "NORMAL".

- **Perbaikan yang Diterapkan:**
  1. **Pembersihan Database PostgreSQL Supabase (2.822 Baris Dinormalkan):**
     - Mengeksekusi SQL update untuk menolkan/menullkan `hargaPromo`, `diskon`, `discountType`, `acara`, `fromDate`, `toDate` pada 2.822 produk yang memiliki `acara` mengandung kata "NORMAL" tanpa potongan harga riil.
     - Hasil pada artikel `T1KT1351`: 20 SKU promo asli (AQUA, SUNSHINE YELLOW, CERAMIC, BLUSH, SALMON - SP59 Rp 59.000) tetap promo, 58 SKU lainnya berstatus murni harga normal.
  2. **Sanitasi Ketat Pipeline Python Ingestion ([`python-engine/run_promo_sync.py`](file:///c:/Max%20Display/price-checker/python-engine/run_promo_sync.py)):**
     - Menyaring `acara`, `tipe_diskon`, `diskon`, dan `harga_promo`:
       - Jika `not item.get("is_promo")`, seluruh field promo diset `None`.
       - Istilah yang mengandung `"NORMAL"` atau `"REGULAR"` tidak pernah ditulis ke `acara` atau `discountType`.
       - Jika `harga_promo >= harga_normal`, harga promo otomatis dibatalkan (`None`).
       - Diterapkan pada `process_single_promo_file` dan `compile_upcoming_promo_draft`.
  3. **Pemisahan Tegas Deteksi Promo Varian vs Katalog ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Menambahkan fungsi `isNormalPriceText` (menangkap "NORMAL", "REGULAR", "HARGA NORMAL").
     - `isVariantPromoActiveClient`: Khusus mengecek varian individual. HANYA bernilai true jika tanggal berlaku aktif DAN memiliki promo riil (`hargaPromo < hargaNormal`, ATAU diskon riil > 0, ATAU tipe promo khusus riil). Pengecekan `articleHasPromo` dan `acara` murni dihapus dari varian.
     - `isCatalogPromoActiveClient`: Dibuat khusus untuk level katalog (`item.articleHasPromo || isVariantPromoActiveClient(item)`).
     - Hasilnya: varian normal (seperti BLACK) bersih dari badge `PROMO`, kartu ukuran hanya menampilkan stok murni (`Stok 3`, `Stok 7`, dst.), sementara varian promo (seperti AQUA) tetap menampilkan badge `Rp 59.000`.
  4. **Proteksi Mandiri di IndexedDB Klien & Server Helpers ([`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), [`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`src/lib/smartSearchEngine.ts`](file:///c:/Max%20Display/price-checker/src/lib/smartSearchEngine.ts)):**
     - `isNormalPriceTerm` diterapkan di seluruh helper.
     - `sanitizeAndIndexModel` di IndexedDB Dexie seketika membersihkan cache lokal klien jika ada produk lama yang membawa istilah NORMAL palsu.
     - `cleanPromoList` di server membersihkan fake promo lama secara background ke Supabase.
     - `isPromoActiveForProduct` dan `groupProductsByArticle` di smart search engine memblokir label promo jika tipe diskon berlabel NORMAL.

- **Verifikasi Nyata:**
  - `python -m py_compile python-engine/run_promo_sync.py`: Lulus (`PY_COMPILE_OK`).
  - `npx tsc --noEmit`: Lulus `0` error (`TSC_OK`).
  - `npm run build`: `47/47` rute terkompilasi sempurna (`BUILD_OK`).
  - Zero-truncate audit: `0` pelanggaran kelas pemotong teks (`whitespace-normal break-words`).

---

### 101. Pembenahan Total Supabase Disk IO Over-Budget, Jalur Tol Khusus Live Stock (~1 Detik), & Auto-Save 3 Tabel DB untuk Scrap Barcode + Gambar (21 November 2026)

- **Laporan Pengguna:**
  1. Dashboard Supabase menunjukkan status **Unhealthy** (PostgREST, Auth, Realtime, Storage Unhealthy) akibat **Disk IO Budget terlampaui** pada paket Free Tier Nano.
  2. Tombol **Live Stock** sangat lambat karena terus "mencari jalur / ngeping jalur" dan mem-probe puluhan SKU satu per satu.
  3. Memastikan tombol **Scrap Barcode & Gambar** untuk produk yang tidak ditemukan langsung menyimpan data lengkap (produk, barcode/alias, galeri gambar, dan entri katalog) ke database secara permanen begitu muncul.

- **Temuan Forensik Nyata (`pg_stat_statements`, `pg_stat_user_tables`, `pg_stat_user_indexes`):**
  1. **Spam `17.288` kali UPSERT ke `storage.objects` (`22 MB WAL`, `277.551` index scans):** `persistRefreshedSessionIfAny()` di `mdsBisaClient.ts` mengunggah ulang `secrets/mds_cookie.txt` ke Supabase Storage pada setiap respons StoreHub yang membawa header `Set-Cookie`.
  2. **Tsunami Fallback `/api/export-products` (`815` call = `4.863.756` baris = `701.962` blok Disk IO):** Saat Storage lambat dan `manifest.json` di `/api/check-update` timeout `2.5s`, HP kasir langsung jatuh ke mode cadangan 52 chunk full-scan PostgreSQL.
  3. **Ukuran DB `475 MB` (nyaris menyentuh batas `500 MB` Free Tier) & 12 Index Berat pada `Product` (`139 MB`):** 4 index mubazir (`Product_stok_idx` duplikat 3.6 MB, `Product_color_trgm_idx` 12 MB / 8 scan, `Product_dept_trgm_idx` 15 MB / 15 scan, `Product_brand_trgm_idx` 10 MB / 14 scan) memicu *cache thrashing* RAM 128 MB dan memperberat beban WAL/Disk IO di setiap `UPDATE`/`INSERT`. Sementara `SyncHistory` terkena `1.730` seq_scan tanpa index.
  4. **Bottleneck Live Stock (`20–45 detik`):** `getStoreHubCookie()` sebelumnya menunggu download Storage + loop sequential 12 JS chunk, `checkLiveStockFast()` belum memanfaatkan `itemData.relatedStock` (menembak hingga 78 SKU berantai selama 20 detik), dan `prisma.ts` membatasi `connection_limit=1`.
  5. **Celah Penyimpanan Scrap Produk Baru:** `upsertStoreHubItemToDb` hanya menyimpan 1 `imageUrl` (belum mengisi array galeri `images[]`), belum menjamin input kode asli user masuk `BarcodeAlias`, dan `finalizeProductFamilyResponse` belum meng-upsert entri baru ke tabel `CatalogArticle`.

- **Perbaikan yang Diterapkan:**
  1. **Optimasi Langsung Index & Disk IO PostgreSQL Supabase ([`prisma/schema.prisma`](file:///c:/Max%20Display/price-checker/prisma/schema.prisma)):**
     - Menghapus 4 index mubazir di produksi (`Product_stok_idx`, `Product_color_trgm_idx`, `Product_dept_trgm_idx`, `Product_brand_trgm_idx`) → **ukuran DB turun langsung dari `475 MB` ke `436 MB` (`-39 MB`)** dan **index `Product` turun dari `139 MB` ke `99 MB` (`-40 MB`)**.
     - Menambahkan 2 index kecil strategis: `SyncHistory_status_type_createdAt_idx` dan `CatalogArticle_article_idx`.
     - Menyesuaikan query fallback di [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts) agar hanya menyentuh kolom terindeks GIN (`description`, `article`) + B-tree prefix (`sku`, `barcode`) sehingga 0 Sequential Scan 260 MB.
     - Memperketat cache [`src/app/api/check-update/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/check-update/route.ts) (`60s` + simpan `lastKnownManifest` agar tidak pernah mengirim `snapshotUrl: null`), [`src/app/api/export-products/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/export-products/route.ts) (`s-maxage=1800`), serta proteksi [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts) (retry CDN snapshot 2x + larang fallback 52 chunk Postgres bila HP sudah punya >= 1.000 SKU).
     - Menaikkan `connection_limit` pool Supavisor di [`src/lib/prisma.ts`](file:///c:/Max%20Display/price-checker/src/lib/prisma.ts) dari `1` → `5` (`pool_timeout=10`, `connect_timeout=8`).
  2. **Jalur Tol Khusus Live Stock (`~1–2 detik`, 0 Nyari Jalur) ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`src/app/api/live-stock/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/live-stock/route.ts), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - **Throttle Upload Storage (`STORAGE_COOKIE_UPLOAD_COOLDOWN_MS = 15 menit`):** menghentikan total 17.288 spam write `storage.objects`.
     - **Direct Login Jalur Tol:** `getStoreHubCookie()` kini cache 18 menit di RAM dan langsung `POST /login` memakai `ACTION_LOGIN` tersimpan (~400ms) tanpa download Storage dan tanpa loop 12 JS chunk dulu (hanya resolve JS **paralel `Promise.all`** bila 404). `resolveDetailActionHash()` juga diubah menjadi paralel.
     - **`checkLiveStockFast()` v2:** HP kasir mengirim `familyVariants` (`sku, color, size, stok`) + `article`. Server melakukan **1 request langsung ke StoreHub** → langsung menyerap `allItems` + memetakan **`itemData.relatedStock`** ke seluruh warna & ukuran dalam 1 tarikan! Jika `relatedStock` kosong, maksimal 1 gelombang paralel cepat (maks 16 SKU, prioritas warna aktif, timeout 3.5 detik). Penulisan ke PostgreSQL jalan di belakang layar (`after()`) dan **0 write ke DB** jika stok tidak berubah!
  3. **Auto-Save Permanen 3 Tabel DB untuk Scrap Barcode & Gambar Produk Tidak Ditemukan ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - `upsertStoreHubItemToDb` kini menyimpan penuh **`imageUrl` + array galeri `images[]`** ke tabel `Product`, serta menjamin kode input asli pengguna (`originalInputCode`) selalu tersimpan ke **`BarcodeAlias`** dan `Product.barcode`.
     - `finalizeProductFamilyResponse` otomatis melakukan backfill `images[]` dan langsung meng-**UPSERT entri katalog baru ke tabel `CatalogArticle`** (plus mengembalikan `savedToDb: true` dan `aliases` lengkap ke IndexedDB HP).

- **Verifikasi Nyata:**
  - DB Supabase: Ukuran turun dari `475 MB` → `436 MB` (`Product` indexes `139 MB` → `99 MB`), `SyncHistory` & `CatalogArticle` terindeks penuh.
  - `npx tsc --noEmit`, `npm run build` (`47/47` rute), dan audit zero-truncate lulus 0 error.

---

### 102. Reset Bersih Sales PQ Lama -> Mesin Tarik Sales Otomatis SUKO MDS BISA (0 RAM Supabase) & Redesign UI/UX Laporan Penjualan (21 November 2026)

- **Arahan Pengguna:**
  1. Membenahi total UI/UX halaman Laporan Sales (`/super-admin/laporan-penjualan`) berdasarkan pre-review interaktif (`laporan_sales_uiux_prereview.html`) dengan tema **Clean Light Toko + switch ke Executive Dark**.
  2. Mengganti sumber rekap penjualan dari Power Query lama ke **MDS BISA (stok real-time SUKO + harga promo Excel/normal)**, hanya memindai produk **SUKO** (mengecualikan **MUKU & ZES** yang stoknya `0` / `-1` karena beda role akun), **0 beban RAM Supabase**.
  3. Menghapus bersih seluruh data sales lama & memulai rekap bersih dari **21 November 2026** lengkap dengan **Top 10 Best Seller, Stok Kritis, Slow Moving, Ranking Departemen, dan Rekonsiliasi BOM → MTD → EOH**.

- **Perubahan yang Diterapkan:**
  1. **Reset Bersih Baseline Sales MDS BISA (21 Nov 2026) di Supabase:**
     - `TRUNCATE TABLE "DailySales"` (menghapus 4.282 baris sales PQ lama) & membersihkan `PoSuggestion` lama.
     - Reset 7.415 baris kolom sales PQ lama di `Product` ke `0`, membersihkan baseline `bom_unit`/`eoh_retail` pada 1.775 produk stok `<= 0`.
     - Menetapkan baseline stok awal hari ini untuk **5.956 SKU aktif SUKO** (**62.638 pcs**, valuasi inventori **Rp 10,78 Miliar**) & mencatat `SyncHistory` (`MDS_SALES_SYNC`).
  2. **Mesin Tarik Sales Otomatis SUKO (0 RAM Supabase) ([`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py), [`python-engine/run_admin_analytics.py`](file:///c:/Max%20Display/price-checker/python-engine/run_admin_analytics.py), [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml)):**
     - Menambahkan `_is_suko_sales_eligible()`, `_resolve_effective_price()`, `record_mds_delta_sales()`, dan mode cepat **`--suko-sales-only`** (hanya memindai ~5.956 SKU SUKO berstok aktif di RAM GitHub Actions 7 GB, skip 0 write untuk produk tanpa penjualan, tolak stok negatif `-1` MUKU/ZES & batas RTO `<= 25 pcs`, otomatis hitung harga promo Excel vs normal).
     - Merombak `build_sales_report_summary_payload()` di `run_admin_analytics.py` dari 4x Full Table Scan 310rb baris menjadi **1x Index Scan ketat (`WHERE stok > 0` ~5.956 baris + `DailySales`)** di RAM Python, termasuk pre-compute `deptBreakdown`, `topFastMtd`, `topKritis` (`sales_mtd >= 1` & stok `0..5`), dan `topSlow` (`stok >= 10` SUKO) ke `analytics/sales-report-summary.json` CDN.
     - Memperbaiki bug lama di mana `SUM(stok)` ikut menjumlahkan stok `-1` MUKU/ZES.
     - Menambahkan action `suko-sales` di [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts) & [`src/app/api/admin/trigger/github-dispatch/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts).
  3. **Pencatatan Delta Sales Real-Time di Live Stock HP & Zero Full-Scan API ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts)):**
     - `checkLiveStockFast()` (`persist()` di `after()`) kini ikut mencatat penurunan stok SUKO (`0 < prevStok - newStok <= 25`, exclude MUKU/ZES) ke `DailySales` & kolom sales `Product` secara real-time dan anti double-count.
     - `/api/admin/sales-report` memprioritaskan `deptBreakdown` & ringkasan dari CDN Python (0 full-scan `groupBy` 310rb baris Postgres!) digabung ringan dengan `DailySales` bulan berjalan.
  4. **Redesign Total UI/UX Laporan Penjualan ([`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx)):**
     - Default **Clean Light Toko** + tombol switch instan **Light / Executive Dark** (`localStorage`).
     - Tombol **⚡ Tarik Sales SUKO** (trigger GitHub Actions Python), **Refresh**, **CSV**, dan **PDF** (PIN `220117` + notifikasi toast error bila PIN salah — memperbaiki bug lama!).
     - **Hero Revenue Spotlight + 4 Kartu KPI 2×2** dengan **Target MTD yang bisa diedit langsung**, ASP, DoD & MoM Growth.
     - **4 Tab Segmented Pill Modern:** AreaChart dengan switch Omzet/Qty + Peak/Avg, **Ranked Department Progress List** (bebas truncate, klik untuk filter), **Rekonsiliasi & Rincian SKU otomatis Card View di HP** (0 horizontal scroll, 0 text truncation).

- **Verifikasi Nyata:**
  - `python -m py_compile morning_full_sweep.py run_admin_analytics.py`: Lulus (`PY_COMPILE_OK`).
  - `run_admin_analytics.py --analytics`: Sukses mengunggah `analytics/sales-report-summary.json` bersih ke Storage CDN.
  - `npx tsc --noEmit`, `npm run build` (`47/47` rute), dan audit zero-truncate lulus 0 error.

---

### 103. Mobile UI/UX Polish, Target Toko Global Editable (SPV/Developer), & Mode Cut-Off Periode (Tgl 1–Akhir Bulan + Kustom) (21 November 2026)

- **Arahan Pengguna:**
  1. Merapikan tampilan UI/UX Mobile (`360px–390px`) halaman Laporan Penjualan agar rapi, simetris, bebas overflow, dan tidak ada teks terpotong.
  2. Menjadikan bar persentase departemen mengacu pada **Target Toko Global** (default **Rp 2 M**, bisa diedit oleh **SPV** atau **Developer** agar seluruh perangkat otomatis ikut menyesuaikan).
  3. Menambahkan **Mode Cut-Off** default **Tanggal 1 s/d tanggal berakhirnya bulan tersebut** (otomatis 28/29/30/31) plus opsi **Cut-Off Kustom** (`Dari Tanggal` – `Sampai Tanggal`).
  4. Meluruskan tampilan `SUKO CASUAL ... Rp 6 M` pada kartu lama (yang merupakan **valuasi stok fisik EOH `30.189 pcs × harga retail`**, bukan omzet sales lama) agar label `Omzet` vs `Stok EOH` terpisah tegas.

- **Perubahan yang Diterapkan:**
  1. **Mobile-First Polish (`fa631ea`) ([`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx)):** Penataan ulang header aksi simetris di HP (`grid-cols-2` / `grid-cols-4`), hero omzet, 4 kartu KPI, 4 tab segmented pill, dan daftar departemen tanpa nested scroll & zero truncate.
  2. **Target Toko Global SPV/Developer (`9c7101c`) ([`src/app/api/admin/store-target/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/store-target/route.ts), [`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx)):**
     - Endpoint `GET/POST /api/admin/store-target` menyimpan target global ke Supabase Storage (`excel-uploads/analytics/store-target.json`, default `Rp 2.000.000.000`, 0 beban tabel Postgres), tervalidasi ketat hanya untuk role `SUPERVISOR` / `ADMIN` / `SUPER_ADMIN` atau NIK Developer `22054178`.
     - Bar kontribusi departemen secara default mengacu ke **Target Toko** (`Omzet Dept / Target Toko`), menampilkan label jelas `Rp 0 (0.0% dr Target)` + sub-baris `Stok 30.189 pcs • EOH Rp 6 M`, dengan switch opsional ke mode `EOH Stok`.
  3. **Mode Cut-Off Bulanan (Tgl 1 – Akhir Bulan) & Cut-Off Kustom ([`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts), [`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx)):**
     - API `/api/admin/sales-report` mendukung `cutoffStart` & `cutoffEnd` (`YYYY-MM-DD`), default otomatis **Tanggal 1 s/d hari terakhir bulan aktif (`28/29/30/31`)**, dan saat Cut-Off Kustom aktif mengagregasi murni dari tabel `DailySales` untuk `summary`, `categoryBreakdown`, `topFast`, `items`, dan `trendData` (0 full-scan `Product`) serta mengembalikan blok `cutoff: { start, end, isCustom }`.
     - UI menambahkan Bar Mode Cut-Off (`📅 Cut-Off Tgl 1 – Akhir Bulan` | `✂️ Cut-Off Kustom`) lengkap dengan indikator rentang aktif, pemilih tanggal mobile-friendly, tombol `Terapkan Cut-Off`, dan pencantuman periode Cut-Off di ekspor PDF.

- **Verifikasi Nyata:**
  - Audit zero-truncate pada `src/app/super-admin/laporan-penjualan/page.tsx`: `0` temuan.
  - `npx tsc --noEmit` dan `npm run build` lulus `exit code 0`.

---

### 104. Rebranding Privasi Total: Ganti Seluruh Teks `MDS BISA`, `Matahari.com`, & `StoreHub` yang Terekspos di UI/API/Log Menjadi `luqman org` (21 November 2026)

- **Arahan Pengguna:** Menghilangkan seluruh penyebutan `"MDS BISA"` dan `"Matahari.com"` (termasuk `"StoreHub"`) yang terekspos di antarmuka aplikasi, pesan notifikasi, ekspor PDF, respons API, riwayat sinkronisasi, dan live console log, lalu menggantinya menjadi **`luqman org`** tanpa memutus koneksi teknis backend/Python.
- **Perubahan yang Diterapkan:**
  1. **Seluruh Halaman UI (`src/app/page.tsx`, `src/app/cek-harga/page.tsx`, `src/app/super-admin/laporan-penjualan/page.tsx`, `src/app/super-admin/sinkronisasi-harian/page.tsx`):** Mengganti seluruh label tombol, toast notifikasi, kartu Notice barcode tidak ditemukan, tooltip, info ZES, badge status, judul grafik/PDF, dan tabel riwayat sync menjadi **`luqman org`**.
  2. **Pesan Respons API & Masking Otomatis (`src/lib/mdsBisaClient.ts`, `src/lib/githubDispatcher.ts`, `src/app/api/product/[identifier]/route.ts`, `src/app/api/admin/sales-report/route.ts`, `src/app/api/last-update/route.ts`, `src/app/api/admin/trigger/self-heal/route.ts`, `src/app/api/admin/trigger/github-status/route.ts`):** Memperbarui pesan user-facing menjadi `luqman org` sekaligus memasang masking otomatis untuk histori `SyncHistory` lama, step GitHub Actions, diagnosis, dan `consoleLines` — sementara seluruh endpoint fetch teknis (`storehub.mdsretailing.id`, `matahari.com`) di server tetap utuh 100%.
  3. **Python Guardian Log Sanitizer (`python-engine/runner_guardian.py`):** Menambahkan masking branding pada `sanitize_log_line()` serta pesan diagnosis & self-heal agar console log yang diunggah ke `logs/live-runner-log.json` bebas dari eksposur sumber eksternal.

---

### 105. Login Geofencing GPS (Pakuwon Mall & Tunjungan Plaza Surabaya) + Shift Otomatis Tanpa Toggle Manual + Pengecualian SPV/Developer (21 November 2026)

- **Arahan Pengguna:**
  1. Mengganti konsep login shift pagi/siang manual menjadi **otomatis** (hilangkan tombol toggle Shift Pagi/Siang di `/login`).
  2. Menerapkan **tracking lokasi HP (GPS Geofencing)** agar Crew Store hanya bisa login saat berada di area **Pakuwon Mall Surabaya** (`-7.28918, 112.67565`, radius `750m`) atau **Tunjungan Plaza / TP Surabaya** (`-7.26238, 112.73928`, radius `700m`), dengan alert tegas **`"Kamu sedang tidak bekerja"`** jika berada di luar area kerja atau di luar jam operasional (`08:00–23:00 WIB`).
  3. **Pengecualian Mutlak:** `SUPERVISOR` & Developer (`22054178`) bebas akses login dari mana saja dan kapan saja tanpa verifikasi GPS maupun batas jam.
- **Perubahan yang Diterapkan:**
  - [`src/lib/storeGeofence.ts`](file:///c:/Max%20Display/price-checker/src/lib/storeGeofence.ts): Modul geofencing Haversine terpusat (Pakuwon Mall & TP Surabaya, buffer akurasi indoor GPS sehat maks `180m`), helper `resolveAutoShiftType()` & `isWithinStoreOperatingHours()`.
  - [`src/app/api/auth/check-nik/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/check-nik/route.ts): Mengembalikan flag `isBypassLocation` untuk SPV/Developer.
  - [`src/app/api/auth/login/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/auth/login/route.ts) & [`src/middleware.ts`](file:///c:/Max%20Display/price-checker/src/middleware.ts): Validasi geofencing GPS ketat di server (anti bypass frontend), auto-shift WIB, dan jam operasional mall `08:00–23:00 WIB` khusus Crew Store.
  - [`src/app/login/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/login/page.tsx): Menghapus `ShiftToggle`, menambahkan kartu status GPS otomatis (fallback High Accuracy -> Wi-Fi/Network untuk dalam gedung mall), badge bebas lokasi SPV/Developer, dan modal alert `"Kamu sedang tidak bekerja"`.

---

### 106. Standarisasi 2 Toko Resmi (`SUKO 719 PAKUWON MALL` & `SUKO 720 TUNJUNGAN PLAZA`) & Alert Cerdas Susulan Lupa Tarik Sales Kemarin (21 November 2026)

- **Arahan Pengguna:**
  1. Menstandarkan daftar penempatan toko di `/super-admin/users` (Tambah & Edit Karyawan) serta geofencing menjadi **2 toko resmi saja**: **`SUKO 719 PAKUWON MALL`** dan **`SUKO 720 TUNJUNGAN PLAZA`**.
  2. Menambahkan **Alert Khusus "Kemarin Belum Tarik Sales"** pada halaman Laporan Penjualan: jika tanggal kemarin terlewat belum tarik sales, saat pagi/buka toko muncul alert & modal konfirmasi bahwa tarikan sales pertama akan **otomatis masuk ke tanggal kemarin**; setelah selesai, alert hilang dan tarikan sales berikutnya **otomatis masuk ke tanggal hari ini yang sebenarnya**.
- **Perubahan yang Diterapkan:**
  - [`src/lib/storeGeofence.ts`](file:///c:/Max%20Display/price-checker/src/lib/storeGeofence.ts) & [`src/app/super-admin/users/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/users/page.tsx): Menambahkan konstanta `OFFICIAL_STORES` (`SUKO 719 PAKUWON MALL`, `SUKO 720 TUNJUNGAN PLAZA`) dan mengganti input teks bebas `Penempatan Toko` di form Tambah & Edit Karyawan menjadi `<select>` 2 toko resmi tersebut.
  - [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts): Mendeteksi `missedYesterday` (`hasMissed`, `yesterdayDate`, `todayDate`) secara otomatis dari `SyncHistory` (`Buku YYYY-MM-DD`) & `DailySales` untuk hari kemarin (`>= 2026-11-21`).
  - [`src/app/api/admin/trigger/github-dispatch/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml), & [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py): Mendukung parameter `salesDate` / `--sales-date=YYYY-MM-DD` agar tarikan susulan membukukan delta sales ke tanggal kemarin (`DailySales.date` & `SyncHistory` `Buku YYYY-MM-DD`), lalu tarikan berikutnya otomatis normal ke hari ini.
  - [`src/app/super-admin/laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx): Menampilkan banner alert amber, modal konfirmasi alur 2-langkah (tarikan ke-1 → kemarin, tarikan ke-2 → hari ini), serta badge `Buku: <tanggal>` pada Live Loader.

---

### 107. Finalisasi Geofencing Ketat Per-Toko (`SUKO 719` vs `SUKO 720`), Pindah Lokasi 1-Klik SPV/Dev, & Checklist Tes Besok (21 November 2026 — Save Point `c53e01e`)

- **Perubahan Final yang Sudah Live (`c53e01e`):**
  1. **Geofencing Ketat Per-Toko (`resolveAssignedStoreZone` di [`src/lib/storeGeofence.ts`](file:///c:/Max%20Display/price-checker/src/lib/storeGeofence.ts)):**
     - Pin **SUKO 719 PAKUWON MALL** dikalibrasi tepat ke pin toko SUKO (`-7.2896, 112.6747`, radius `750m`), dan **SUKO 720 TUNJUNGAN PLAZA** (`-7.26238, 112.73928`, radius `700m`).
     - Crew `SUKO 719 PAKUWON MALL` hanya bisa login di Pakuwon Mall (ditolak di TP), dan Crew `SUKO 720 TUNJUNGAN PLAZA` hanya bisa login di Tunjungan Plaza (ditolak di Pakuwon).
     - Jam operasional aktif: **`08:00 – 23:00 WIB`** (di luar jam tersebut ditolak `"Kamu sedang tidak bekerja"` meski di depan mall; `SUPERVISOR` & Developer `22054178` bebas akses 24 jam dari mana saja).
  2. **Deteksi GPS Mobile Anti-Macet & Hapus Demo Notice ([`src/app/login/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/login/page.tsx), [`next.config.ts`](file:///c:/Max%20Display/price-checker/next.config.ts)):**
     - Header `Permissions-Policy: geolocation=(self)`, deteksi 2-tahap + hard timeout `11s`, tombol refresh tidak pernah terkunci, dan kotak demo koordinat sudah dihapus bersih setelah lulus tes nyata di HP (jarak lurus 10,48 km Ploso–Pakuwon Mall terverifikasi akurat).
  3. **Pindah Lokasi Kerja Crew 1-Klik ([`src/app/super-admin/users/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/users/page.tsx), [`src/app/api/admin/users/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/users/route.ts)):**
     - Baik **SPV** maupun **Developer** kini bisa memindahkan penempatan toko crew (`SUKO 719 PAKUWON MALL` ↔ `SUKO 720 TUNJUNGAN PLAZA`) langsung dari dropdown tabel atau modal Edit.
- **Checklist Tes & Lanjutan Besok (Saat Jam Toko Buka ≥ 09:00 WIB):**
  1. **Tes Login Crew di Lokasi Mall Nyata (`SUKO 719` & `SUKO 720`):** Pastikan akun crew (`223515` dkk.) terverifikasi hijau di toko masing-masing dan bisa klik `MULAI KERJA`.
  2. **Tes Live Tarik Sales SUKO (`Tarik Sales SUKO Sekarang`):** Pantau Live Loader (`0% → 100%`), auto-refresh laporan, angka omzet/qty/Top 10/Stok Kritis terisi real-time, serta verifikasi alur Alert Susulan Kemarin jika keesokan harinya terlewat.
  3. **Tes Edit Target Toko (Rupiah Penuh) & Cut-Off Kalender 100 Tahun + Ekspor PDF/CSV.**
  4. **Opsional:** Penyesuaian jam operasional buka/tutup toko di `storeGeofence.ts` bila ingin dipersempit dari `08:00–23:00 WIB` (mis. `09:00–22:30 WIB`).

---

### 108. Migrasi Total Database Utama dari Supabase PostgreSQL (500 MB) ke Turso Cloud Singapore (5 GB Free Tier) + Backup Lokal & Rollback Instan (22 November 2026)

- **Latar Belakang & Tujuan:** Database Supabase sebelumnya terpakai `435 MB / 500 MB` (87% penuh, sering `unhealthy`/overload). Sesuai arahan User (*"sekarang putus aliran suppabase karna kita ganti all semua sambungan ke turso"*), **100% sambungan Supabase (baik Database PostgreSQL maupun Supabase Storage & Gmail GAS)** diputus total dan dialihkan seluruhnya ke **Turso Cloud (`suko-retail`, region AWS Singapore `ap-southeast-1`, kapasitas gratis 5 GB)**.
- **Jaminan Keamanan & Rollback Instan ke Supabase:**
  1. **Branch Git Pengaman:** `origin/backup/supabase-stable` (menunjuk ke commit stabil terakhir Supabase `3bf98d5`).
  2. **Backup Lokal Lengkap (`c:\Max Display\backups\supabase-2026-11-22\`):** Seluruh 10 tabel (`388.470` baris dalam format `.jsonl.gz`) + `schema.prisma.bak`, `prisma.ts.bak`, `env.bak`, dan `BACKUP_MANIFEST.json`.
  3. **Database Supabase Produksi Utuh:** Tidak dihapus/diubah sama sekali (berfungsi sebagai cadangan dingin / *cold standby*).
- **Perubahan Arsitektur yang Diterapkan (0% Supabase):**
  1. **Migrasi Data & Storage 100% ke Turso (`suko-retail`):** Seluruh `388.470` baris 10 tabel + `22` berkas Storage (`secrets/gh_token.txt`, `secrets/mds_cookie.txt`, `analytics/*.json`, `logs/live-runner-log.json`, `offline-db/manifest.json`, `offline-db/snapshot-*.json.gz` 6 chunk, & 15 Excel promo aktif) telah disalin penuh ke tabel `StorageObject` & `StorageChunk` di Turso Cloud.
  2. **Backend Next.js + Prisma LibSQL + Turso Object Storage (`prisma/schema.prisma`, [`src/lib/prisma.ts`](file:///c:/Max%20Display/price-checker/src/lib/prisma.ts), [`src/lib/tursoStorage.ts`](file:///c:/Max%20Display/price-checker/src/lib/tursoStorage.ts), [`src/lib/supabaseClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/supabaseClient.ts), [`src/app/api/storage/[...path]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/storage/%5B...path%5D/route.ts)):**
     - Menggunakan `@prisma/adapter-libsql@5.22.0` + `@libsql/client` (`previewFeatures = ["driverAdapters"]`, `provider = "sqlite"`) dengan `$extends` auto-parse/serialize JSON array (`images`, `articleColors`, `articleSizes`).
     - Seluruh operasi file (`upload`, `download`, `list`, `remove`, `manifest.json`, `analytics/*.json`, `offline-db/snapshot-*.json.gz`) 100% dilayani dari Turso `StorageObject`/`StorageChunk` (multi-chunk `1,5 MB` bebas batas payload `4,5 MB` Vercel, folder `secrets/` diblokir HTTP 403).
  3. **Python Engine 100% Turso ([`python-engine/turso_db.py`](file:///c:/Max%20Display/price-checker/python-engine/turso_db.py)) & GitHub Workflow ([`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml)):**
     - Seluruh 10 skrip runner (`morning_full_sweep.py`, `run_promo_sync.py`, `build_catalog_index.py`, `build_offline_snapshot.py`, `run_admin_analytics.py`, `runner_guardian.py`, `raw_vault_collector.py`, `matahari_catalog_expander.py`, `brutal_image_scraper.py`, `repair_broken_images.py`) memakai Turso HTTP Pipeline API v2 + Turso Storage tanpa 1 byte pun env Supabase.
  4. **Gmail GAS Bebas Supabase ([`scripts/gas_turso_uploader.js`](file:///c:/Max%20Display/price-checker/scripts/gas_turso_uploader.js)):** Mengirim lampiran Excel promo langsung ke `https://luqmanganteng.my.id/api/webhook/gmail` → tersimpan ke Turso `StorageObject` → memicu `run_promo_sync.py`.
- **Wajib Diisi Sebelum/Saat Deploy Produksi:** Tambahkan `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` di **Vercel Environment Variables** dan **GitHub Repository Secrets** (variabel Supabase lama boleh dihapus).

---

### 109. Direct Webhook Promo Email/GAS → Turso + Global Live Promo Progress Loader (`PromoSyncBanner`) untuk Semua User Login (22 November 2026)

- **Arahan Pengguna:**
  1. Ketika Turso menerima file promo dari Email / Google Apps Script (GAS), mesin langsung bekerja memperbarui semuanya otomatis (`Product` promo → `CatalogArticle` → Offline Snapshot `.json.gz` → Analytics JSON).
  2. Setiap user yang sedang login (Crew maupun Super Admin) langsung melihat **Loader Progres Update Promo real-time** saat promo sedang berjalan, maupun status **Promo Baru Sudah Masuk (100%)** untuk promo yang baru/sudah selesai masuk.
- **Perubahan yang Diterapkan:**
  1. **Direct Webhook Tanpa Extra HTTP Hop ([`src/app/api/webhook/gmail/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/webhook/gmail/route.ts), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), [`scripts/gas_turso_uploader.js`](file:///c:/Max%20Display/price-checker/scripts/gas_turso_uploader.js)):**
     - `/api/webhook/gmail` langsung menyimpan lampiran ke Turso `StorageObject`, menulis marker live instan `logs/promo-sync-live.json`, dan langsung memanggil `dispatchToGitHubRunner({ action: 'promo' })` di proses yang sama.
     - Mendukung `skipTrigger` + `triggerFolder` untuk email multi-lampiran Excel agar seluruh lampiran dalam 1 email diproses serentak dalam 1 run GitHub Actions.
  2. **API Status Progres Ringan ([`src/app/api/promo-sync-status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/promo-sync-status/route.ts)):**
     - Cache memori 4 detik, membaca `logs/promo-sync-live.json` + `logs/live-runner-log.json` dari Turso Storage + `SyncHistory` terbaru secara paralel.
     - Menghitung persentase akurat (`10% → 96% → 100%`) lintas 3 tahap (`Parse Excel Promo` → `Susun Katalog & Snapshot` → `Finalisasi Turso`).
  3. **Global Live Banner ([`src/components/PromoSyncBanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/PromoSyncBanner.tsx) di [`src/components/LayoutWrapper.tsx`](file:///c:/Max%20Display/price-checker/src/components/LayoutWrapper.tsx)):**
     - Tampil di seluruh halaman terautentikasi: progress bar biru animasi real-time (polling 5 detik saat aktif) & otomatis berubah menjadi banner hijau **100% Selesai / Promo Terbaru Aktif** lengkap dengan nama promo, jumlah SKU, jam WIB, tombol **Muat Harga Terbaru**, dan tombol tutup per-`syncKey` (muncul lagi otomatis bila promo baru masuk).

---

### 110. Optimasi Laser-Focused Scraping (Skip Produk Komplit), Auto-Cancel Self-Heal, Manual Update Gambar = Update Foto + Artikel/SKU, & Scan Barcode Baru Auto-Tembak MDS + Matahari (22 November 2026)

- **Arahan Pengguna:**
  1. Saat trigger scrab foto / SKU dijalankan, **fokus HANYA pada produk yang belum punya foto / belum ada di tabel DB** (jangan audit ulang produk yang sudah lengkap foto & barcodenya).
  2. Tombol manual **`Update Gambar`** sekaligus memperbarui **Foto + Artikel + SKU + Barcode + Varian** produk tersebut.
  3. Saat scan barcode yang belum ada di DB, **otomatis langsung nembak MDS BISA + Matahari.com** dan menyimpan hasilnya ke Turso.
  4. Tombol **`Benahi & Ulangi`** otomatis membatalkan run GitHub Actions yang sedang nyangkut agar tidak pernah antre macet lagi.
- **Perubahan yang Diterapkan:**
  - [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml) & [`python-engine/brutal_image_scraper.py`](file:///c:/Max%20Display/price-checker/python-engine/brutal_image_scraper.py): Trigger `photos` kini **melewati `KATEGORI 1B`** (hemat ~11 menit) dan langsung menjalankan `brutal_image_scraper.py` yang hanya memuat produk `WHERE "imageUrl" IS NULL OR TRIM("imageUrl") = ''` (+ foto donor khusus artikel yang masih bolong — 0% audit produk yang sudah komplit!).
  - [`python-engine/raw_vault_collector.py`](file:///c:/Max%20Display/price-checker/python-engine/raw_vault_collector.py): Fix SQLite `MAX("updatedAt")` string ISO, fallback baca cookie dari Turso Storage, dan perampingan default koleksi aktif (`120`).
  - [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) & [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx): Klik manual **`Update Gambar`** (`force: true`) kini otomatis menyinkronkan **Artikel + SKU + Barcode + Varian + Stok** dari MDS BISA sekaligus **Foto Studio** dari Matahari.com lalu memperbarui UI & Dexie lokal.
  - [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts): Scan barcode/SKU (`8–14 digit`) yang belum ada di Turso kini **otomatis langsung menembak MDS BISA + Matahari.com** (timeout 12 detik, lengkap dengan keluarga varian & foto studio) dan langsung menyimpannya ke Turso Cloud.
  - [`src/app/api/admin/trigger/self-heal/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/self-heal/route.ts): Otomatis membatalkan paksa run GitHub Actions yang sedang nyangkut & mereset log error lama di Turso sebelum menjalankan run baru.

---

### 111. Kategori Baru `SPORT` + Filter Segmen Gender (`Men`, `Ladies`, `Boys`, `Girls`) Lintas SUKO, Mu+Ku, & ZES (`v17_sport_gender`) (22 November 2026)

- **Arahan Pengguna:**
  - Memisahkan produk per segmen **`Men`, `Ladies`, `Boys`, dan `Girls`** di **SUKO, Mu+Ku, dan ZES** (misal saat membuka `Celana`, tidak lagi tercampur Men/Ladies/Boys/Girls).
  - Menambahkan kategori khusus **`SPORT` (Sport & Active)** beserta pemisahan segmen `Men` / `Ladies` / `Boys` / `Girls`.
- **Perubahan Menyeluruh (Online Turso API + Offline Dexie + Python Catalog Brain + UI):**
  1. **Single Source of Truth ([`src/lib/productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts)) & Python Parity ([`python-engine/build_catalog_index.py`](file:///c:/Max%20Display/price-checker/python-engine/build_catalog_index.py)):**
     - Menambahkan kategori **`SPORT`** (`Sport & Active`, kata kunci `SPORT/ACTIVE/GYM/RUNNING/YOGA/TRAINING/TRACKPANT/QUICKDRY/CLIMATECH/JERSEY/JOGGING` + dept `SUKO SPORTS MEN/LADIES`, menjaga `TOWEL/HANDUK` tetap di `TAS_AKSESORIS`).
     - Menambahkan `GenderKey` (`ALL` | `MEN` | `LADIES` | `BOYS` | `GIRLS`) & `classifyProductGender()` yang akurat untuk seluruh 3 toko: kode artikel huruf ke-3 SUKO (`^[A-Z]\d([MLBG])`) + dept `SUKO SPORTS MEN/LADIES` & `SUKO BOYS/GIRLS`, `ZES MEN`/`ZES WOMEN`, serta dept ERP/deskripsi/sub-brand `Mu+Ku` (`ANAK LAKI-LAKI`, `ANAK PEREMPUAN`, `PRIA`, `WANITA`, dst.).
  2. **Backend API & Offline Dexie ([`src/lib/productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`src/app/api/catalog/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), [`src/app/api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts)):**
     - Mendukung parameter `?gender=MEN|LADIES|BOYS|GIRLS` & `?category=SPORT`, mengembalikan `genderCounts` akurat per segmen pada konteks toko + kategori aktif.
     - Bump `MODELS_TAXONOMY_VERSION = "v17_sport_gender"` + re-klasifikasi dinamis `categoryKey` & `genderKey` di `sanitizeAndIndexModel()` agar HP offline langsung dapat `Sport` & `Men/Ladies/Boys/Girls` 0ms tanpa perlu re-download 310k SKU.
  3. **UI/UX Bar Segmen & Chip Kartu ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx)):**
     - Menambahkan tombol kategori **`Sport`** (ikon SVG pelari) di Bar 2, serta **Bar 3 `Segmen:`** (`Semua`, `Men`, `Ladies`, `Boys`, `Girls`) berwarna pembeda + counter jumlah artikel akurat, plus badge segmen pada header filter & setiap kartu produk (0 `truncate` / `line-clamp-*`).

---

### 112. Akselerasi Sinkronisasi Offline 320rb SKU: Multi-Worker Pool + Native IndexedDB Relaxed + Edge CDN Chunk Fast-Path (22 November 2026)

- **Akar Masalah Sebelumnya (~2 menit + main thread lag saat membuka paket & menyimpan 319.848 SKU):**
  1. Download chunk snapshot hanya `CONCURRENCY = 3` (2 query Turso per chunk).
  2. Dekompresi GZIP + `JSON.parse()` + transformasi 320rb objek dijalankan di Main Thread.
  3. `db.products.bulkPut()` Dexie memakai `durability: "default"` (`strict` `fsync()` ke disk tiap 15.000 SKU), plus `models` dan `aliases` menunggu `products` selesai dulu.
- **Upgrade Jalur Tol Utama + Fallback Otomatis:**
  - [`public/workers/offline-sync-worker.js`](file:///c:/Max%20Display/price-checker/public/workers/offline-sync-worker.js) & [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts):
    - **8 Jalur Download Paralel** + auto-retry 2x/chunk di Coordinator Worker.
    - **Native GZIP Decompression + JSON.parse** 100% di luar Main Thread (UI 60 FPS bebas freeze).
    - **Pool 4–6 Sub-Worker Paralel** (*dynamic work-stealing queue* 20.000 SKU/paket agar RAM irit) dengan **Native IndexedDB `{ durability: "relaxed" }`** + tight-loop `store.put()` tanpa per-item listener, menulis 3 object store (`products`, `models`, `aliases`) **secara paralel serentak**, dengan fallback otomatis ke 3-Store Parallel Native IDB Relaxed bila nested/Web Worker tidak tersedia.
  - [`src/app/api/storage/[...path]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/storage/%5B...path%5D/route.ts): Fast-path 1-query untuk chunk snapshot immutable + header `CDN-Cache-Control` & `Vercel-CDN-Cache-Control` (`max-age=31536000, immutable`).
  - [`src/components/ShiftLoader.tsx`](file:///c:/Max%20Display/price-checker/src/components/ShiftLoader.tsx): Menampilkan badge **`⚡ N Worker Paralel`** langsung di modal sinkronisasi.

---

### 113. Pembersihan False Positive Kategori `BEAUTY` (`v18_clean_beauty`) & Checkpoint Pagi (22 November 2026, 04:27 WIB)

- **Perbaikan ([`src/lib/productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts), [`python-engine/build_catalog_index.py`](file:///c:/Max%20Display/price-checker/python-engine/build_catalog_index.py), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts), commit `b889acd`):**
  - Menghapus kata pendek ambigu (`LIP`, `BROW`, `BLUSH` tunggal) yang sempat menyeret celana (`TWILL PANTS LIP`), topi (`SKHICAP1 BROW`), sepatu (`SLIP ON` -> `LIP ON`), piyama (`BLUSH FLORAL`), & blouse ke kategori `BEAUTY`; menggantinya dengan frase kosmetik presisi + guard toko/dept fashion (`SUKO`, `ZES`, `SLEEPWEAR`, `SHOES/FW`, dll.).
  - `18` artikel salah kategori sudah langsung dipindahkan di Turso Cloud (`SUKO Beauty = 0`, `ZES Beauty = 0`, `Mu+Ku Beauty = 544` kosmetik/skincare asli).
- **Status Checkpoint Pagi (Semua Bersih & Live di `origin/main`):**
  - Database & Storage **100% Turso Cloud Singapore (`5 GB` free tier, `0%` Supabase)**.
  - Direct Webhook Promo + Global Live Promo Banner aktif.
  - Laser-focused scraping (skip produk komplit) + Self-Heal auto-cancel + Manual Update Gambar (Foto + Artikel/SKU) + Scan barcode baru auto-tembak MDS BISA & Matahari.com aktif.
  - Kategori **`SPORT`**, Filter Segmen **`Men / Ladies / Boys / Girls`**, & Pembersihan **`BEAUTY`** (`v18_clean_beauty`) aktif online & offline.
  - **Multi-Worker Offline Sync Pool (`public/workers/offline-sync-worker.js`)** + Native IndexedDB `{ durability: "relaxed" }` + Edge CDN chunk fast-path aktif.
  - **Opsi lanjutan nanti pagi (jika dibutuhkan):** Sharded multi-rak `products_0..5` atau non-blocking background install (~3 detik langsung buka layar setelah `models` siap).

---

### 114. Arsitektur Dual-Account Terisolasi (SUKO + Mu+Ku Role Anak Mu+Ku) untuk Scrab, Update Stock Live, & Scan Barcode Baru (23 November 2026)

- **Kabar Baru Pengguna:** Mendapatkan akun role anak **Mu+Ku** (`M223708`), sehingga kini sistem memiliki 2 jalur akun StoreHub yang terpisah dan tidak bentrok:
  - **Akun SUKO (`suko`):** cookie `secrets/mds_cookie.txt` (lokal `.mds_cookie`), prioritas `SUKO` & `ZES`.
  - **Akun Mu+Ku (`muku`):** cookie `secrets/mds_cookie_muku.txt` (lokal `.mds_cookie_muku`), prioritas `Mu+Ku` (`NEVADA`, `LITTLE M`, `COLE`, `CONNEXION`, `ST YVES`, `MAXMURAH`, `DISNEY`, `CARDINAL`, `VOLO`, `NAYOUNG`, dll.).
- **Anti-Timpa Stok Lintas Toko + Auto-Fallback:**
  1. [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py): Mendukung `--account=suko` / `--account=muku`, memfilter antrean khusus Mu+Ku pada mode `--account=muku`, dan menjaga `_protect_cross_store_stock()` agar stok `> 0` SUKO tidak pernah tertimpa `0` oleh akun Mu+Ku maupun sebaliknya.
  2. [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts), [`src/app/api/live-stock/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/live-stock/route.ts), & [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx): Auto-router dual-account di `checkLiveStockFast()` dan `checkSingleItemStock()` — produk `Mu+Ku` otomatis tembak akun Mu+Ku, produk `SUKO`/`ZES` tembak akun SUKO, dan bila tidak ketemu / stok `< 0` otomatis fallback ke akun satunya (termasuk saat scan barcode baru!).
  3. [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml), [`src/lib/githubDispatcher.ts`](file:///c:/Max%20Display/price-checker/src/lib/githubDispatcher.ts), [`github-dispatch/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-dispatch/route.ts), [`self-heal/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/self-heal/route.ts), & [`sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx): Menambahkan 2 trigger khusus **`muku-scrab`** (`🏷️ Scrab Produk Mu+Ku + Foto`) & **`muku-stock`** (`⚡ Update Stock Mu+Ku`). Siap langsung ditekan mulai jam `09:00 WIB` saat server toko buka!

---

### 115. Perbaikan Darurat Kebocoran Kuota Turso 505 Juta Rows Read (`COUNT(*)` Polling 3,5 Detik → 0 Full-Scan) (23 November 2026)

- **Akar Masalah `Quota Critical 100%` (`505.969.738 / 500.000.000 Rows Read`):**
  - **BUKAN karena tarik sales.** Penyebab utama (~95%) adalah [`src/app/api/admin/trigger/github-status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-status/route.ts) yang sebelumnya memanggil `prisma.product.count()` (`310.536` rows read di SQLite) + `prisma.catalogArticle.count()` (`57.367` rows read) = **`367.903` rows read per request**, sementara halaman [`sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx) melakukan polling tiap **3,5 detik** non-stop (~`378 Juta` rows read/jam!).
- **Aturan Permanen Turso SQLite (ANTI-BOCOR KUOTA):**
  - **DILARANG keras** memanggil `prisma.product.count()` / `SELECT COUNT(*) FROM "Product"` pada endpoint polling atau serverless! Di SQLite/Turso, `COUNT(*)` memindai seluruh B-tree tabel. Selalu baca total SKU/Artikel dari `offline-db/manifest.json` (`1` row read!) + in-memory cache.
- **Perbaikan yang Diterapkan:**
  1. [`github-status/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/trigger/github-status/route.ts): Hapus `prisma.product.count()` & `catalogArticle.count()`, ganti dengan `getLightweightDbMetrics()` dari `offline-db/manifest.json` (cache 10 menit, turun dari `367.903` → `~10` rows read/request = **hemat 99,997%**!).
  2. [`sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx): Smart adaptive polling — pause total saat tab tersembunyi (`document.hidden`), `5 detik` saat run aktif, `30 detik` saat idle.
  3. [`productQueryHelpers.ts`](file:///c:/Max%20Display/price-checker/src/lib/productQueryHelpers.ts), [`catalog/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), [`reports/dashboard/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/reports/dashboard/route.ts), & [`runner_guardian.py`](file:///c:/Max%20Display/price-checker/python-engine/runner_guardian.py): Seluruh `COUNT(*)` / `aggregate` full-scan dialihkan ke `manifest.json` / `sales-report-summary.json` + TTL cache 15–30 menit.
- **Migrasi Turso v2 & Delta-Only Writes (`4e8ff1c`):**
  - Migrasi penuh ke Turso Free v2 (`libsql://suko-retail-v2-luqmanmen.aws-ap-southeast-1.turso.io`, `388.470` rows + `22/22` Storage objects) serta mengubah `python-engine/build_catalog_index.py` dari `DELETE ALL + INSERT ALL` (`~803k` writes/run) menjadi **Delta-Only Upsert** (hemat ~98% kuota writes).

---

### 116. Perbaikan 1-Klik Responsif (Anti Harus Klik 2x) pada Live Stok, Update Gambar, & Trigger GitHub Actions (23 November 2026)

- **Masalah yang Dilaporkan User:** Tombol **Live Stok**, **Update Gambar / Foto**, dan **Trigger GitHub Actions** sebelumnya sering harus ditekan **2 kali ("peng 2")** baru terlihat ter-update.
- **Akar Masalah & Perbaikan:**
  1. **⚡ Live Stok ([`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx) & [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts)):**
     - Pada klik #1 (cold start / cookie expired), timeout `postStoreHubLoginDirect` (`6000ms`) & `queryStoreHubDetail` (`5000ms`) kadang kepepet sementara cookie sedang di-refresh; ditambah batch lanjutan di `checkLiveStockFast()` belum meneruskan `activeAccount` (berdampak pada produk Mu+Ku).
     - **Solusi:** Naikkan timeout login `6000ms -> 9000ms`, query utama `5000ms -> 7000ms`, teruskan `activeAccount` di semua batch paralel, tambah **1x silent auto-retry otomatis** di `handleCheckLiveStock` (jika percobaan #1 gagal transient & bukan `storeOffline`), dan pastikan `setProduct` memakai `variantStockMap.get(prev.sku) ?? data.stok`.
  2. **📸 Update Gambar / Foto ([`src/components/ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx), [`src/app/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/page.tsx), & [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts)):**
     - `ProductImageSlider` sebelumnya hanya mereset `hasError` / `thumbError` / `useRawFallback` bila string `imagesKey` berubah, sehingga foto yang sempat gagal load atau URL sama tidak me-reload di klik pertama; selain itu `healProductImagesInDb` punya race timeout MDS sync `9000ms` yang memakan waktu sebelum fetch foto Matahari.
     - **Solusi:** Tambah prop `refreshVersion` di `ProductImageSlider` (mereset seluruh error state & me-remount `<img>` utama + thumbnail via `key`), increment `imageRefreshVersion` setiap selesai `handleHealProductImages` (plus 1x silent retry jika tombol manual gagal transient), dan turunkan race timeout MDS sync di `healProductImagesInDb` menjadi `4500ms` dengan `preferredAccount` Mu+Ku/SUKO.
  3. **🚀 Trigger GitHub Actions ([`src/app/super-admin/sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx)):**
     - Setelah `POST /api/admin/trigger/github-dispatch` sukses, sebelumnya UI langsung me-reset `isGhDispatching = false` dan hanya poll 1x setelah `1.2 detik` — padahal GitHub Actions butuh `3–8 detik` untuk membuat run baru di `/actions/runs`, sehingga UI masih menampilkan run lama dan membuat user mengira klik #1 tidak masuk.
     - **Solusi:** Tambah **Optimistic Queued State** (`optimisticQueued`) segera setelah dispatch/self-heal sukses + **progressive polling bertahap (`3s`, `6.5s`, `11s`, `16s`)** yang langsung mati begitu `activeRun.id` baru atau status `queued`/`in_progress` terdeteksi, lengkap dengan indikator *"Menyiapkan antrean GitHub Actions..."* agar 1 klik langsung terkunci & ter-update otomatis.

---

### 117. Login 4-Fase Langit Real-Time, Reset Pondasi Sales 23 Nov 2026, Dual-Account Auto-Trigger (SUKO + Mu+Ku), & 7-Jalur Foto Scraper (23 November 2026)

- **UI/UX Login 4-Fase Langit Otomatis (`5c19020`, `427398b`, `f50a9c4`, `355ff59`):**
  - Memulihkan background `.login-stage` di [`src/app/globals.css`](file:///c:/Max%20Display/price-checker/src/app/globals.css) + [`src/app/login/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/login/page.tsx) menjadi **4 fase otomatis real-time** (*Pagi 06–10 matahari terbit hangat + sinar berputar*, *Siang 11–15 terik menyala*, *Sore 16–17 senja golden hour*, *Malam 18–05 langit gelap + 50 bintang + bulan*).
  - Mengembalikan kapsul langit [`src/components/ShiftToggle.tsx`](file:///c:/Max%20Display/price-checker/src/components/ShiftToggle.tsx) di bawah tombol **MULAI KERJA** tanpa bulatan/knob geser (`knob` dihapus, 100% otomatis mengikuti jam).
- **Cleanup Vercel Deployments:** Menghapus `170` deployment lama via Vercel REST API (`Failed: 0`), menyisakan tepat 3 deployment teratas.
- **Reset Pondasi Sales Bersih 23 Nov 2026 (`9bbd79b`):**
  - Menghapus `41` riwayat `SyncHistory` sales lama, membersihkan angka hantu di `analytics/sales-report-summary.json` menjadi `0` (sambil mempertahankan `62.036 pcs` EOH & `319.856` SKU), dan memperbarui `SALES_BASELINE_START_DATE = "2026-11-23"` di [`src/app/api/admin/sales-report/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/sales-report/route.ts) & [`laporan-penjualan/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/laporan-penjualan/page.tsx).
- **Dual-Account Auto-Sync (SUKO + Mu+Ku) & 7-Jalur Image Scraper (`69b64c0`, `bbcedb3`, `4650b9e`, `b28579b`, `26b15cb`):**
  - **Kredensial Resmi 2 Akun StoreHub (`4650b9e`):**
    - **SUKO:** `M223515` / `Luqmen123!` (cookie `secrets/mds_cookie.txt`)
    - **Mu+Ku:** `M223708` / `Aurel_28` (cookie `secrets/mds_cookie_muku.txt`)
    - *(ZES menyusul setelah akses akun role ZES tersedia.)*
  - [`.github/workflows/retail-sync-engine.yml`](file:///c:/Max%20Display/price-checker/.github/workflows/retail-sync-engine.yml) & [`sinkronisasi-harian/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/sinkronisasi-harian/page.tsx): Tombol 1-Klik Utama **`▶ Jalankan Semua (SUKO + Mu+Ku)`** (`all`) dipindahkan ke paling atas Master Control dengan `timeout-minutes: 150`, `--no-catalog` pada Step 1A/1D, dan alokasi waktu seimbang (SUKO + Mu+Ku + Foto 7-Jalur + Stock Live + Promo + Catalog Delta-Only).
  - [`python-engine/brutal_image_scraper.py`](file:///c:/Max%20Display/price-checker/python-engine/brutal_image_scraper.py): Upgrade ke **7-Jalur Foto Studio** (Jalur 5 Exact Article Suggest, Jalur 6 Trimmed/Base Article + SKU/Barcode Suggest, & Jalur 7 HTML Search Fallback dengan rate-limit guard anti-429 + fix `json.dumps` Turso SQLite).
  - **Zero-Excel Mu+Ku Live Promo (`checkItemPromotion`, `26b15cb`):** Ditemukan & dipasang Server Action resmi StoreHub `checkItemPromotion` (`60a67fb6833e81c90695ed315a2dc4394535951a87`) di [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py) (`sweep_muku_promotions_for_catalog()`, 1x per artikel unik Mu+Ku -> wariskan ke seluruh varian SKU) dan [`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts) (`queryStoreHubPromotion()`, aktif otomatis saat Live Scan Mu+Ku di HP).
- **Status Checkpoint Final (23 November 2026, 02:26 WIB — Siap Tempur Jam 09:00 WIB):**
  - Branch `main` bersih & tersinkron penuh di GitHub + Vercel (`luqmanganteng.my.id`) + Turso v2 (`suko-retail-v2-luqmanmen`).
  - **Toko Baru (`ce36828`):** `MU+KU PAKUWON MALL` ditambahkan ke `OFFICIAL_STORES` & `WORK_LOCATION_ZONES` dengan koordinat GPS & radius sama persis dengan `SUKO 719 PAKUWON MALL`.
  - **Scanner 60 FPS GPU (`a20f199`):** Animasi laser diubah ke `transform: translate3d` GPU-composited + deteksi Native `BarcodeDetector` langsung dari `<video>` + adaptive non-blocking loop (720p@60fps).
  - **Fix Barcode New Arrival & 193rb SKU Mu+Ku (`60dc459`):** `BARCODE-RECOVERY` kini mengurutkan SKU aktif & New Arrival (angka SKU terbesar) duluan, ditambah **Jalur 0B (`NEW-ARRIVAL-BARCODE-SYNC`)** dan penangkapan otomatis `VendorBarcode` / EAN-13 baru ke tabel `BarcodeAlias` di `execute_live_stock_sync` + `--no-inline-images`.
  - **Pivot Audit Kelengkapan SKU (`723e23b`):** Ditambahkan `build_sku_audit_pivot_payload()` di [`python-engine/run_admin_analytics.py`](file:///c:/Max%20Display/price-checker/python-engine/run_admin_analytics.py) (`analytics/sku-audit-pivot.json`, 1 row read) + [`SkuAuditPivotCard.tsx`](file:///c:/Max%20Display/price-checker/src/components/SkuAuditPivotCard.tsx) di Master Control untuk memantau kelengkapan Barcode, Gambar, & Harga per toko (`SUKO`, `Mu+Ku`, `ZES`).
  - **TURBO MATRIX STOCK ENGINE (`checkItemStock` — 60× Lebih Cepat & Hemat 60% Writes Turso!):** Live probe membuktikan `checkItemDetail` tidak pernah mengirim `relatedStock` sehingga cara lama cuma sempat cek `1.680` SKU SUKO & `2.400` SKU Mu+Ku dalam 40 menit. Kini `execute_live_stock_sync()` di [`python-engine/morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py) memakai Server Action **`checkItemStock`** (`609a33bf9f07b2014de2e2303717cb33ca4a588314`, `50–100ms` per artikel penuh = 10–40 SKU sekaligus!), isolasi ketat toko SUKO (`1.205` artikel selesai `< 1 menit`) vs Mu+Ku (`58.667` artikel), dan `flush_stock_only_deltas()` (`UPDATE stok, updatedAt` delta-only).
  - **Page 1 Stock-First Sorting (`Ada Stok > 0` Selalu Paling Atas!):** Memperbaiki urutan katalog di [`src/lib/productTaxonomy.ts`](file:///c:/Max%20Display/price-checker/src/lib/productTaxonomy.ts) (`compareBrowseItems`), [`src/lib/offlineDb.ts`](file:///c:/Max%20Display/price-checker/src/lib/offlineDb.ts) (`ensureModelsIndexReady` yang sebelumnya terurut abjad Primary Key IndexedDB `3957`, `3PCTSSPACE`, `76TKPRM02`, serta re-sort otomatis saat Live Stok / Foto di-update), [`src/app/api/catalog/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/catalog/route.ts), dan [`python-engine/build_catalog_index.py`](file:///c:/Max%20Display/price-checker/python-engine/build_catalog_index.py) (`sortRank`): urutan resmi kini **`articleTotalStok > 0` (#1) → `imageUrl` (#2) → `articleTotalStok DESC` (#3) → `articleHasPromo` (#4) → Abjad**.
  - **Pembersihan Total Mesin Lama & Sinkronisasi End-to-End (Anti-Sisa Migrasi):**
    1. **9 File Mati Dihapus:** `brutal_scraper.py`, `master_auditor.py`, `local_full_backup.py`, `run_morning_scrap.bat`, `run_morning_sweep.bat`, 3 file `LAPORAN_*.md` lama, & 1 CSV temp Oktober.
    2. **Fix Bug `runner_guardian.py`:** Menambahkan impor `storage_download_json` yang sempat terlewat (penyebab `Baseline DB: 0 SKU (MAX id=0)`) dan menghapus impor sisa Supabase.
    3. **Upgrade Live Stok HP (`mdsBisaClient.ts`) ke Turbo Matrix `checkItemStock`:** Menghapus 100% jalur mati `relatedStock` dan menggantinya dengan `queryStoreHubStockMatrix()` (`1 request = seluruh warna × size` dalam `50-90ms`).
    4. **Stop Double-Build Catalog (`matahari_catalog_expander.py --no-catalog`):** Menghilangkan rebuild `CatalogArticle` ganda saat `all`/`scrab` jalan di GitHub Actions.
    5. **Sinkronisasi Penuh Tombol UI ↔ Dispatcher (0% Supabase) ↔ Workflow:** `mds-bisa` kini murni SUKO saja (tidak ikut jalankan Mu+Ku); Kategori 2 kini jujur & jelas terbagi menjadi **`Update Stock Semua (SUKO + Mu+Ku)` (`stock-only`)**, **`Update Stock SUKO Saja` (`suko-stock`)**, dan **`Update Stock Mu+Ku Saja` (`muku-stock`)**; serta seluruh badge usang (`84.763 SKU`, `relatedStock`) telah dihapus total.
  - **Perbaikan Darurat Harga Miliar (`.000000` → ×1.000.000):** Ditemukan `12.199` SKU (`2.263` artikel) memiliki harga terkalikan `1.000.000×` (mis. `159000.000000` terparsing jadi `Rp 159.000.000.000`) akibat `_parse_money_int()` di [`morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py#L1407-L1432) hanya memotong desimal `<= 2` digit dan `seedNormalPrice` di [`mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts#L2233) memakai `.replace(/[^0-9]/g, '')`. Seluruh `12.199` SKU & `2.263` artikel di Turso Cloud telah dipulihkan seketika (`/ 1.000.000`), seluruh parser Python & TS telah dikunci anti-6-desimal, plus guard normalisasi otomatis ditambahkan di `offlineDb.ts` & `productQueryHelpers.ts` sehingga browser lama sekalipun langsung menampilkan `Rp 159.000` seketika saat refresh.
  - **Image Quality Controller 2-Lapis (Anti Kartu Putih Polos + Hapus Total Logo Matahari Abu-Abu — 24 Nov 2026):**
    - **Akar Masalah:** (1) Kartu katalog putih polos (`OJSTMM`, `DSCOLMM`, `TS46MM2` padahal HTTP 200 saat diklik) disebabkan `<img loading="eager" decoding="sync">` yang menembak 40 foto HD sekaligus lalu mengunci `imgEl.style.opacity = "0"` permanen saat transient error tanpa retry/reset `onLoad`. (2) Logo Matahari abu-abu memiliki 2 sidik jari eksak berukuran **`281×363 px`**: versi UUID `/files/product_<uuid>.jpg` (**`2.238 bytes`**) & versi menyamar nama produk asli (**`3.163 bytes`**).
    - **Frontend Controller:** [`src/lib/imageController.ts`](file:///c:/Max%20Display/price-checker/src/lib/imageController.ts) + [`src/components/CatalogImageController.tsx`](file:///c:/Max%20Display/price-checker/src/components/CatalogImageController.tsx) + [`src/app/api/product/purge-junk-image/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/purge-junk-image/route.ts) — shimmer halus, cek cache `img.complete`, auto-retry 2× (450ms & 1400ms), deteksi dimensi `281×363` di runtime `onLoad` (langsung blokir & lapor hapus permanen ke Turso), terintegrasi di `page.tsx`, `ProductImageSlider.tsx`, `offlineDb.ts`, & `mdsBisaClient.ts`.
    - **Backend Python Controller:** [`python-engine/image_quality_controller.py`](file:///c:/Max%20Display/price-checker/python-engine/image_quality_controller.py) — terpasang di `brutal_image_scraper.py` (tolak `281×363` di JSON Shopify), `matahari_catalog_expander.py`, `repair_broken_images.py`, `build_catalog_index.py`, dan otomatis jalan di `KATEGORI 1C` `.github/workflows/retail-sync-engine.yml`.
    - **Pembersihan Live Turso Cloud:** Memindai `43.444` URL unik (`9.106` HEAD probe non-SKU) & langsung membersihkan **`5.797` SKU** + **`1.661` artikel** ber-logo Matahari abu-abu (`1.829` URL sampah: `1.417` logo abu-abu 3.163B + `405` logo UUID 2.238B + `7` 404).
  - **Universal Scrap Controller & QR/Alphanumeric Scanner (`scrap_controller.py` — 24 Nov 2026):**
    - Membangun [`python-engine/scrap_controller.py`](file:///c:/Max%20Display/price-checker/python-engine/scrap_controller.py) agar scraping tidak lagi kaku pada `234000*` / 8-digit angka saja: otomatis mempelajari seluruh klaster **QR Code & Barcode Alfanumerik unik** (`4.753+` kode eksisting seperti `2663005FS`, `AN011809`, `TP010392`, `001.53121SH25M`), mengekspansi tetangga angka inti + variasi suffix ukuran (`FS/XS/S/M/L/XL/XXL/OS`), menguji `Article-as-QR`, serta melakukan sensus SKU 8-digit adaptif lintas seluruh blok aktif (`SUKO`, `Mu+Ku`, `ZES`) di `morning_full_sweep.py` (`JALUR 0C: ALPHANUMERIC-QR-SWEEP`).
    - Upgrade [`TextScanner.tsx`](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx) (tambah `DATA_MATRIX`, `AZTEC`, `PDF_417` + 2-frame fast lock untuk QR/alfanumerik) dan [`api/product/[identifier]/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/product/%5Bidentifier%5D/route.ts) (aktifkan auto-live fallback Mu+Ku → SUKO saat scan QR unik seperti `2663005FS` belum ada di DB).
    - Workflow `.github/workflows/retail-sync-engine.yml` kini selalu menjalankan `KATEGORI 5 (Pivot Audit)` setelah `scrab`/`muku-scrab`/`photos` + `40 workers` & 27 menit penuh `BARCODE-RECOVERY` Mu+Ku. `DailySales` anomali `Rp 89,9M` sudah dipulihkan ke `Rp 89.900`.
  - **Hybrid Auto-Scan & Routing Deterministik Berbasis Brand/Dept (24 Nov 2026):**
    - **Routing Akun Role 100% Deterministik ([`src/lib/mdsBisaClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/mdsBisaClient.ts)):** Menentukan pemilik toko **langsung dari `Brand` / `Department` produk (`classifyBrandGroup`), BUKAN menebak dari angka stok** (0% rancu bahkan saat stok `0`!):
      - `Brand/Dept` mengandung **`SUKO`** → WAJIB akun role **SUKO (`M223515`)**
      - `Brand/Dept` mengandung **`ZES`** → WAJIB akun role **ZES** *(slot siap)*
      - Selain itu (Multibrand / Konsinyasi) → WAJIB akun role **Mu+Ku (`M223708`)**
      - Saat auto-scan barang baru: tembak 1× untuk baca master produk → cek `classifyBrandGroup` → bila akun awal beda dari pemilik toko, langsung pindah 1× ke akun pemiliknya untuk mengambil **stok riil (`>0`, `0`, `-1`) + Matrix + Promo Live aslinya**, lalu simpan ke `Product` + `BarcodeAlias` (`LIVE_SUKO`/`LIVE_MUKU`) + `analytics/hot-scan-seeds.json`.
    - **Hot-Scan Burst Exploration ([`scrap_controller.py`](file:///c:/Max%20Display/price-checker/python-engine/scrap_controller.py) & [`morning_full_sweep.py`](file:///c:/Max%20Display/price-checker/python-engine/morning_full_sweep.py)):** Menambahkan **JALUR 0A (`HOT-SCAN-BURST-SKU` & `HOT-SCAN-BURST-QR`)** yang membaca `analytics/hot-scan-seeds.json` dan meledakkan **`±60` SKU Modulo-10 + tetangga QR/ukuran** di sekitar setiap barang unik hasil scan crew (plus burst `±35` SKU untuk setiap temuan artikel baru di eksplorasi).
  - **Pembersihan Total Double System & Arsitektur 1-Pintu (Pure Python Heavy Engine + Thin TypeScript UI — 24 Nov 2026):**
    - **Pembagian Tugas Tunggal (0% Double System):**
      - **Python (`python-engine/` di GitHub Actions 16 GB RAM):** 100% mesin berat — scraping multi-toko (SUKO `M223515` + Mu+Ku `M223708` + slot ZES), Turbo Matrix stok, Hot-Scan Burst & QR/Alphanumeric sweep (`scrap_controller.py`), 7-Jalur Foto & Image Quality Controller, Parser Promo Excel + AI, kompilasi `CatalogArticle` + Snapshot `.json.gz`, dan Pivot/Sales Analytics.
      - **TypeScript (`src/` Next.js di Vercel):** Murni tampilan UI browser/HP (React, kamera 60fps, IndexedDB offline, login/JWT) + kurir ringan `< 1 detik` (baca Turso/CDN, lempar tombol trigger ke GitHub Actions, & 1-item auto-scan/live-stock kilat saat kasir scan di depan pelanggan).
    - **60 Berkas Mati & Duplikat Dihapus Permanen:**
      - **0% Supabase Shim:** Menghapus [`src/lib/supabaseClient.ts`](file:///c:/Max%20Display/price-checker/src/lib/supabaseClient.ts), menghapus adapter emulasi `tursoStorageClient` di [`tursoStorage.ts`](file:///c:/Max%20Display/price-checker/src/lib/tursoStorage.ts), memigrasikan 8 berkas tersisa langsung ke fungsi native Turso (`writeTursoStorage`/`readTursoStorageText`/`listTursoStorage`/`removeTursoStorage`), serta menghapus 4 paket npm mati (`@supabase/supabase-js`, `tesseract.js`, `csv-parse`, `csv-parser`).
      - **15 API Route Mati/Duplikat Dihapus** (API turun dari 52 → 37 rute aktif): `/api/admin/trigger/mds-bisa`, `/api/admin/trigger/photos`, `/api/sync-offline`, `/api/upload/debug-blobs`, `/api/upload/clean-folder`, `/api/upload/chunk`, `/api/upload/reprocess-from-blob`, `/api/upload/sync-latest-blob`, `/api/admin/clean-promo`, `/api/admin/po/close`, `/api/admin/po/generate`, `/api/admin/reset-sync`, `/api/auth/check-user`, `/api/reports/dashboard`, `/api/revalidate`.
      - **2 Komponen Mati Dihapus:** `Scanner.tsx` & `TextScanner_SKU_Backup.tsx`.
      - **6 Berkas Railway/FastAPI/PQ Mati di `python-engine/` Dihapus:** `Dockerfile`, `Procfile`, `runtime.txt`, `main.py`, `audit_images.py`, `reprocess_storage_pq.py` + pembersihan `requirements.txt` (buang `fastapi`, `uvicorn`, `supabase`, `psycopg2-binary`, `pydantic`, `python-multipart`).
      - **22 Skrip Node.js Duplikat di `scripts/` Dihapus** (termasuk `sync_mds_bisa_full.mjs`, `sync_matahari_images.js`, `gas_supabase_uploader.js`, dan seluruh skrip PQ lama — menyisakan hanya [`scripts/gas_turso_uploader.js`](file:///c:/Max%20Display/price-checker/scripts/gas_turso_uploader.js) yang aktif untuk Gmail Promo Webhook) + **14 berkas temp/debug/walkthrough lama di root**.
    - **Verifikasi:** `npm run build` (`35/35` halaman) + `npx tsc --noEmit` (`exit 0`) lulus 100%.
  - **100% Pure Python Live Scan di Vercel (`api/py_live.py` — `sin1`) & Penghapusan Total `mdsBisaClient.ts` (24 Nov 2026):**
    - Membangun [`python-engine/storehub_live_engine.py`](file:///c:/Max%20Display/price-checker/python-engine/storehub_live_engine.py) (**100% Python stdlib murni — 0 dependency berat**, cold start kilat `< 300ms` di Vercel `sin1` Singapura) yang menangani seluruh komunikasi live StoreHub: Auto-Scan barang baru/QR (`2663005FS`) dengan Hard Deadline Cap 6,5 detik + routing Brand/Dept deterministik (`SUKO` `M223515` vs `Mu+Ku` `M223708` + slot `ZES`), Turbo Matrix Live Stock `checkItemStock`, Live Promo `checkItemPromotion`, Image Quality Controller (filter logo abu-abu `2.238B`/`3.163B`), Upsert langsung ke Turso (`Product` + `BarcodeAlias` + `CatalogArticle`), & pencatatan `analytics/hot-scan-seeds.json`.
    - Mendeploy sebagai Vercel Python Serverless Function di [`api/py_live.py`](file:///c:/Max%20Display/price-checker/api/py_live.py) (dikonfigurasi `includeFiles` di [`vercel.json`](file:///c:/Max%20Display/price-checker/vercel.json)).
    - Menghapus permanen **`src/lib/mdsBisaClient.ts` (`3.013` baris / `122 KB`)** dan menggantinya dengan jembatan tipis 60 baris [`src/lib/pyLiveBridge.ts`](file:///c:/Max%20Display/price-checker/src/lib/pyLiveBridge.ts). Sekarang **0% logika StoreHub di TypeScript** — 100% 1 otak Python di Vercel (`sin1`) & GitHub Actions!
    - **Optimasi Kecepatan `< 5 Detik` & Checkpoint 24 Nov 2026 05:44 WIB (`e8c49bc`):** Tembak paralel `upc`+`sku`, paralel Matrix + Promo + Foto Studio (anti logo abu-abu), canonical origin `www.luqmanganteng.my.id` (0 redirect hop `308`), hard-cap `4,2 dtk`, dan stop fallback teks acak pada QR unik. Terverifikasi live di `www.luqmanganteng.my.id/api/py_live` (`HTTP 200`, `python-stdlib`, `tursoConfigured: true`). **Agenda Pembuktian Live Jam 09:00+ WIB (saat toko buka):** (1) Scan QR unik `2663005FS` untuk ukur real `elapsedMs` + auto-add + foto + stok, (2) Uji 1-klik Live Stok Turbo Matrix `< 1 detik`, (3) Jalankan Scrab & Update Stok SUKO + Mu+Ku via GitHub Actions.













---

## 52. Ekspansi E-Commerce: Auto Customer Service WhatsApp (AI Halo BCA + Foto HD + Anti-Salah-Balas)

- **Tujuan:** Membantu PIC penjualan online membalas pertanyaan produk di Grup Member Eksklusif WhatsApp secara real-time dengan gaya CS profesional ala **Halo BCA**, lengkap dengan **foto HD produk dari Turso DB**, **0% bocor angka stok** (hanya status *Ready* / *Sedang Sold Out*), serta **Saklar Master ON/OFF & Proteksi Anti-Salah-Balas** untuk chat teman/keluarga.
- **Arsitektur 1 Otak Pure Python (`sin1`) + Bridge WA Fleksibel:**
  1. **Python AI CS Engine ([`python-engine/wa_cs_engine.py`](file:///c:/Max%20Display/price-checker/python-engine/wa_cs_engine.py)) & Vercel Function ([`api/py_wa_cs.py`](file:///c:/Max%20Display/price-checker/api/py_wa_cs.py)):**
     - 100% Pure Python Stdlib (`urllib`, `json`, `re`, `datetime`) — 0 external pip deps, berbagi helper Turso HTTP Pipeline v2 dari `storehub_live_engine.py`.
     - **3-Layer Anti-Salah-Balas:** Saklar Master ON/OFF (`enabled: false` default di Turso Storage `config/wa-cs-config.json`), Auto-Schedule Jam Operasional Toko (`09:00–21:30 WIB`), Blokir 100% Chat Pribadi Teman (`ignorePrivateChats: true`), Whitelist Grup Ketat + Auto-Detect Grup Baru (`detectedGroups`), dan Perintah Darurat dari WA PIC (`!csoff`, `!cson`, `!csstatus`).
     - **Hard Privacy Sanitizer:** Seluruh angka `stok` dihapus total di kode Python sebelum masuk Gemini 2.5 Flash / template balasan — secara matematis mustahil membocorkan jumlah pcs stok.
     - **Filter Obrolan Santai:** Gemini 2.5 Flash + fallback regex deterministik otomatis mengabaikan candaan non-produk di grup (`CASUAL_CHAT_IGNORED`).
  2. **Next.js Admin Bridge, Webhook & Cockpit UI:**
     - [`src/app/api/admin/wa-cs/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/admin/wa-cs/route.ts): Bridge terproteksi JWT (`SUPERVISOR` / NIK `22054178`).
     - [`src/app/api/webhook/wa-cs/route.ts`](file:///c:/Max%20Display/price-checker/src/app/api/webhook/wa-cs/route.ts): Siap pakai untuk gateway 24 jam (Fonnte/Wablas) dengan auto-send teks + foto produk HD.
     - [`src/app/super-admin/wa-cs/page.tsx`](file:///c:/Max%20Display/price-checker/src/app/super-admin/wa-cs/page.tsx): Pusat Kontrol Super Admin dengan Saklar Master besar, Simulator Chat Live (preview bubble WA + foto HD), Whitelist Grup 1-Klik, dan Log Aktivitas.
  3. **Bridge WA Lokal Gratis untuk Test Grup Dummy ([`wa-cs-bridge/index.mjs`](file:///c:/Max%20Display/price-checker/wa-cs-bridge/index.mjs)):**
     - Menggunakan `@whiskeysockets/baileys` + `qrcode-terminal` (folder `auth_info/` & `node_modules/` aman di `.gitignore`).
     - Dilengkapi *Human Takeover Pause* (bot otomatis diam 10 menit jika PIC ikut membalas manual di grup) dan *typing indicator* natural (2,2–3,6 detik) sebelum mengirim foto HD + caption balasan.


---

## 35. WA Auto CS SUKO — Master Intelligence v5.1 (Uji Live 22 Skenario Pelanggan Cerewet + Real Pict)

- **Commit Live Production:** `faed038` & `f36b42e` (`https://www.luqmanganteng.my.id/api/py_wa_cs`).
- **Arsitektur & Pembaruan Inti:**
  1. **Python WA CS Engine ([`python-engine/wa_cs_engine.py`](file:///c:/Max%20Display/price-checker/python-engine/wa_cs_engine.py)):**
     - **Negasi Ketat Multi-Dimensi:** Filter negasi warna (`excludeColors` di level artikel + varian + foto HD), negasi lengan panjang (`LENGAN PANJANG`, `LS`, `L/S`, `LEN`), negasi bahan/model (`bukan kaos`, `bukan chino`, `jangan v-neck`), serta kunci kategori agar pencarian `ATASAN` tidak pernah bocor ke `ROK/CELANA`.
     - **Bahasa Awam, Slang & Multi-Gender:** Normalisasi singkatan (`kmja`, `cwo`, `wrna`, `ijo`, `earth tone`) + pemetaan gender per sub-query saat customer bertanya produk pria & wanita dalam 1 pesan sekaligus.
     - **Guardrail Bisnis & Anti-Halusinasi:** Penanganan khusus `WHOLESALE_B2B` (150 pcs/sablon/DP → eskalasi PIC), `MARKETPLACE_ORDER` (Shopee/Tokped/Lazada → jelaskan sistem terpisah), `OUT_OF_CATALOG` (jaket kulit motor, sepatu lari, setelan anti-air < 200rb → 100% jujur tanpa ngarang), `OTHER_BRANCH_STOCK` (jujur khusus SUKO PTC), `SOP_RETUR_REWARDS`, `PROMPT_INJECTION`, dan `COMPLAINT` (dibedakan antara komplain cuci/menyusut vs sarkasme cacat QC benang/kancing, 0 defensif + eskalasi PIC).
     - **Memori Daftar Terakhir & Coreference (`POST_LIST_ANALYSIS` & `isMixMatch`):** Memahami rujukan nomor (`no 2`, `pilihan pertama vs ketiga`, `yang paling murah`, `warna selain hitam`), cross-sell mix & match bawahan tanpa terjebak Single-Product Focus Lock, estimasi BB/TB, dan kalkulasi total + alur QRIS 5 menit tanpa pernah mengarang link checkout palsu.
     - **Kejujuran 100% Real Pict / Tekstur / Try-On / Oper ke Manusia (`PHYSICAL_CHECK`):** Jujur sebagai asisten virtual (tidak pernah berjanji memotret sendiri atau mengirim ulang foto katalog sambil mengaku real pict — `ImgSent=False`), menawarkan solusi realistis, langsung memicu `AlertPIC=True` ke WA PIC `081296393972`, dan otomatis `pauseAfterReply=True` agar staf toko manusia mengambil alih.
  2. **WA Bridge Local Daemon ([`wa-cs-bridge/index.mjs`](file:///c:/Max%20Display/price-checker/wa-cs-bridge/index.mjs)):**
     - Ditambahkan **Private Chat Debounce Buffer 2,6 detik** (`DEBOUNCE_WINDOW_MS = 2600`) untuk menggabungkan spam chat pendek beruntun (misal `"P"` → `"Min mau tanya celana"` → `"eh chino aja..."`) menjadi satu konteks utuh sebelum dikirim ke engine Python.
- **Status Verifikasi Live:** 22/22 skenario (5 skenario dasar + 5 edge case/drama + 6 RAG/pencarian + 6 coreference/checkout + 4 skenario Real Pict/eskalasi manusia) **100% LULUS** langsung di server production Vercel.


---

## 36. WA Auto CS SUKO — Master Intelligence v6.1 (Multi-Key `gemini-3.5-flash-lite`, Product Knowledge Bible & True `/barang-baru` Engine)

- **Commit Live Production:** `5023dff`, `87bff66`, `7ee4eaa`, & v6.1 (`https://www.luqmanganteng.my.id/api/py_wa_cs`).
- **Akar Masalah yang Dituntaskan Total:**
  1. **Multi-Model & Multi-Key AI Router (`_invoke_smart_ai`):** Mengutamakan `gemini-3.5-flash-lite(LOW)` (`~960ms` HTTP 200 & kuota harian besar) + `gemini-3.6-flash(MINIMAL)` + `gemini-3-flash-preview(MINIMAL)` lintas `customGeminiApiKey` & `backupGeminiApiKey` dengan **Smart 429 Cooldown 15 menit di RAM** (0ms skip model limit) dan penghematan 50% kuota AI (fokuskan AI ke Copywriter Tahap 3 yang membaca produk nyata).
  2. **Pembersih Kata Meta (`META_NON_GARMENT_WORDS` & `_clean_garment_keywords`):** Mencegah bug `"kalau produk baru nya apa saja ?>"` mencari kata literal `"PRODUK"`/`"SAJA"` di deskripsi SQL yang sebelumnya menghasilkan *sold out*.
  3. **True New Arrival `0,2ms` (`_fetch_true_new_arrival_articles`):** Menggunakan Primary Key B-Tree `SELECT ... FROM "Product" ORDER BY id DESC LIMIT 320` (identik halaman `/barang-baru`) + **Smart Category Diversity** (kurasi lintas kategori: Sweatshirt/Outer, Polo/Kemeja, Gaun/Celana, SUKO Sports) agar tidak monoton.
  4. **Modul Permanen [`python-engine/suko_product_knowledge.py`](file:///c:/Max%20Display/price-checker/python-engine/suko_product_knowledge.py):** Memetakan seluruh 1.205 artikel riil Store SUKO PTC (Workwear, Sleepwear Sanrio/Disney/Simpsons, Essential/Underwear/Ciput/Kamisol/Kaos Kaki, SUKO Sports/SUKO GO, 25 sub-jenis Wanita), **Auto-Badge Teknologi Bahan** (`4-Way Stretch`, `Quick Dry`, `Anti-Bakteri`, `High Recovery`, `Clima Tech`, `Supima Cotton`, `Soft Touch`, `Bamboo`, `Souffle Yarn`, `Seersucker`, `Windbreaker`, `Parasut Taslan`, `Extra Broadcloth`, dll.), dan **Occasion-to-Department Smart Router** untuk bahasa sehari-hari customer.


---

## 37. Deployment 24/7 Cloud WA CS Bridge via Vercel Daemons (`sin1`) + Turso Cloud Auto-Auth Sync

- **Commit Live Production:** `9fe69b4` & `acd6cf1` (`https://www.luqmanganteng.my.id`).
- **Arsitektur Cloud 100% Tanpa Laptop (`0` local background task):**
  1. **Vercel Daemons (`sin1` Singapore, `1 GiB`):** Dideklarasikan di [`vercel.json`](file:///c:/Max%20Display/price-checker/vercel.json) dengan `root: "wa-cs-bridge/"`, `entrypoint: "Dockerfile"`, `instances: { "sin1": 1 }`, `terminationGracePeriodSeconds: 30`, dan `livenessProbe` HTTP `/health` di port `7860`.
  2. **Turso Cloud Auth Session Sync (`secrets/wa-bridge-auth.json`):** Endpoint secret-protected `bridge-auth-get` & `bridge-auth-save` di [`python-engine/wa_cs_engine.py`](file:///c:/Max%20Display/price-checker/python-engine/wa_cs_engine.py) dan auto-restore/auto-backup + graceful `SIGTERM` di [`wa-cs-bridge/index.mjs`](file:///c:/Max%20Display/price-checker/wa-cs-bridge/index.mjs). Saat container cloud boot ulang, sesi `+6285771123000` otomatis pulih dari Turso tanpa perlu pairing ulang.
  3. **Verifikasi Live:** `bridgeOnline: true`, `connected: true` (`+6285771123000`), `0` local background tasks, seluruh repo tersimpan bersih di GitHub (`luqmanmenmen/CheckPrice`).
  4. **Catatan Kuota:** Vercel Hobby Daemons = 420 GB-jam/bulan (reset tgl 1 tiap bulan); `wa-cs-bridge/Dockerfile` & `fly.toml` juga siap dipindah ke Oracle Cloud Always Free / VPS kapan pun dibutuhkan untuk 720 jam nonstop/bulan.

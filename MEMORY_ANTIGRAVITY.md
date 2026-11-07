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
  * Hasil: Mengembalikan 23 produk Nayoung dengan departemen dan stok akurat.


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











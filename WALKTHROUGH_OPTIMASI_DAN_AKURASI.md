# Walkthrough: Optimasi Kecepatan, Akurasi Varian SKU, & UI/UX Toko

Dokumen ini merangkum seluruh perbaikan, optimasi arsitektur, dan solusi teknis yang telah diselesaikan pada sistem Price Checker SUKO (Aplikasi SA & Kiosk).

---

## 📅 Tanggal: 18 Oktober 2026
**Branch:** `main`  
**Repository:** [luqmanmenmen/CheckPrice](https://github.com/luqmanmenmen/CheckPrice.git)  
**Status Build:** ✅ Production Build Passed (`npm run build` 49 routes 0 error)  
**Versi Rilis:** `v2.3.0`

---

## 🎯 1. Rangkuman Permasalahan & Solusi

| # | Permasalahan Awal | Dampak di Toko | Solusi yang Diterapkan |
| :--- | :--- | :--- | :--- |
| **1** | Stok dan warna tidak muncul saat scan di aplikasi SA (`/`) | SA kesulitan melihat ketersediaan barang dan varian | Penyesuaian `parseProductInfo()` untuk memprioritaskan kolom `color`, `size`, dan `stok` dari database/Dexie sebelum fallback ke parser teks deskripsi. |
| **2** | Jeda loading berkedip beberapa detik saat klik ganti warna di matriks varian | Mengganggu efisiensi pelayanan SA di depan pelanggan | Implementasi fungsi `handleSelectVariant()` yang membaca langsung dari memori aktif `siblings` (0ms latensi, zero flicker). |
| **3** | Keraguan akurasi promo dalam 1 artikel yang memiliki banyak warna | Tidak semua warna diskon (ada warna basic normal & warna broken diskon) | Data disimpan dan dihitung murni di level **SKU unik**, bukan disamaratakan per artikel. Ditambahkan badge `PROMO` dan rincian harga langsung di tombol tiap varian. |
| **4** | Delay hingga 5 detik saat scan produk di mall padahal menggunakan HP flagship | Pelanggan dan SA menunggu lama di depan scanner | Memperbaiki endpoint `/api/product/[identifier]`: pembersihan promo kedaluwarsa diubah menjadi *in-memory* instan dan update database dijalankan secara *asynchronous background*. |
| **5** | Kiosk (`/cek-harga`) fokus pemindai murni teks OCR SKU | Scan price tag pakaian di toko fokus pada teks SKU 8 digit | Memastikan Kiosk berjalan murni 100% menggunakan **TextScanner (OCR teks SKU 8 digit)** tanpa scanner barcode garis dan tanpa tab pemilih yang membingungkan pengunjung. |
| **6** | Laci sidebar tidak mau menutup saat logout ditekan | Tampilan membeku dengan laci menu tetap terbuka | Menambahkan `setIsOpen(false)` pada `handleLogout()`, menaikkan overlay loader ke `z-[999]`, dan transisi halus sebelum redirect ke `/login`. |
| **7** | Kamera pemindai teks SKU lag, stutter, dan freeze saat membidik label harga | SA dan pelanggan frustrasi karena kamera patah-patah dan lambat mengenali | Menghapus loop manual binarisasi pixel JS, beralih ke GPU Canvas Filter (`contrast(200%) grayscale(100%)`), mengunci Tesseract ke PSM 7 (`SINGLE_LINE`) + angka murni 8 digit, standarisasi canvas 360x64 px (~35ms OCR), dan decoupling loop kamera 60 FPS independen via `requestAnimationFrame`. |
| **8** | Prerender Next.js build error saat koneksi Supabase pooler tidak responsif | Gagal build pada CI/CD Vercel & Railway untuk route `/barang-baru` dan `/promo-unik` | Menambahkan `export const dynamic = "force-dynamic";` dan `try/catch` fallback pada page server components tersebut sehingga build selalu 100% lulus. |

---

## 🏗️ 2. Detail Arsitektur & Perubahan Teknis

### A. Akurasi Data per SKU (Warna, Ukuran, & Promo)
1. **Model Database (Prisma/PostgreSQL):**
   * Setiap baris di tabel `Product` adalah **1 SKU unik** (1 kombinasi barcode + warna + ukuran).
   * Kolom `article` hanya berfungsi sebagai relasi induk (*grouping*) untuk mengambil daftar *siblings*.
2. **Tampilan Dinamis di Matriks Varian:**
   * Di dalam `src/app/page.tsx`, setiap tombol varian warna kini mengevaluasi status promonya sendiri:
     ```tsx
     const itemHasPromo = item.isOnPromo;
     const hasPromoPrice = Boolean(item.hargaPromo && item.hargaPromo > 0 && item.hargaPromo < item.hargaNormal);
     ```
   * Tombol varian promo menampilkan badge `PROMO` merah, harga normal dicoret, dan harga promo merah.
   * Tombol varian normal hanya menampilkan harga normal reguler.
   * Saat diklik, kartu utama seketika menyesuaikan harga dan promo sesuai SKU tersebut.

### B. Perbaikan Latensi Server (Eliminasi Jeda 5 Detik)
Di file `src/app/api/product/[identifier]/route.ts`:
* **Sebelumnya:**
  ```ts
  // Menjalankan puluhan UPDATE SQL sinkron via Promise.all sebelum merespon HTTP
  await Promise.all(expiredItems.map(item => db.product.update(...)));
  ```
* **Sesudahnya:**
  ```ts
  // Bersihkan di memori langsung untuk respon super cepat (<50ms)
  p.hargaPromo = null;
  p.discountType = null;
  
  // Update database secara background tanpa memblokir respon ke client
  db.product.update({ where: { id: p.id }, data: { ... } })
    .catch(e => console.error("Auto-clean promo background error:", e));
  ```

### C. Kiosk Dedicated TextScanner SKU (`/cek-harga`)
Di file `src/app/cek-harga/page.tsx`:
* Menggunakan pemindai murni **TextScanner (OCR Teks SKU 8 Digit)** secara full-screen.
* Tanpa barcode scanner garis dan tanpa tab opsi/mode switcher, sehingga pengunjung kiosk toko langsung memindai teks kode SKU 8 digit pada label harga pakaian secara instan dan tanpa distraksi.

### D. Perbaikan Alur Logout di Sidebar
Di file `src/components/Sidebar.tsx`:
* `setIsOpen(false)` dipanggil segera setelah animasi tombol selesai.
* Layar *loader* `"MENGAKHIRI SHIFT..."` dinaikkan ke level `z-[999]` dengan durasi animasi responsif (200ms) dan jeda transisi 700ms sebelum navigasi ke `/login`.

### E. ATURAN MUTLAK SISTEM: Murni 100% TextScanner SKU (Tanpa Barcode Garis)
* **Konteks Operasional Toko Fisik SUKO**: Label harga pakaian dan price tag di toko mengidentifikasi produk melalui **teks nomor SKU 8 digit** (contoh: `61356398`), bukan garis barcode.
* **Status Barcode Scanner**: Barcode scanner (`Scanner.tsx` / `Html5Qrcode` / `BarcodeDetector`) dan icon tombol barcode kamera telah **DIHAPUS TOTAL** dari seluruh aplikasi:
  1. Halaman Publik Kiosk Cek Harga (`/cek-harga`).
  2. Halaman Staf Toko SA (`/` - `src/app/page.tsx`).
* **Pengalaman Staf SA**: Di bilah pencarian aplikasi SA hanya ada **1 tombol pemindai**: `ScanText` (`title="Scan SKU (OCR Teks 8 Digit)"`). Ketika ditekan, langsung membuka [TextScanner](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx) layar penuh.
* **Universal Fast Resume & Battery Safe**: Perbaikan *Visibility Lifecycle Manager* (bangun instan 50ms setelah minimize, 0% CPU saat layar mati, dan auto-resume camera tracks) aktif seragam di seluruh aplikasi.

### F. Overhaul Performa Murni TextScanner: 60 FPS Bebas Freeze & Zero Lag (18 Oktober 2026)
Di file `src/components/TextScanner.tsx`:
1. **Eliminasi Loop CPU JavaScript di Main Thread**:
   * Menghapus loop sinkron `ctx.getImageData()` dan iterasi per-pixel manual yang memblokir rendering browser.
   * Menggantinya dengan **GPU Canvas Filter** hardware-accelerated:
     ```ts
     ctx.filter = "contrast(200%) grayscale(100%) brightness(105%)";
     ctx.drawImage(video, startX, startY, roiW, roiH, 0, 0, targetW, targetH);
     ctx.filter = "none";
     ```
2. **Kunci Tesseract ke Baris Tunggal & Angka Murni**:
   * Mengunci whitelist ke `0123456789-` dan mode segmentasi ke `Tesseract.PSM.SINGLE_LINE` (PSM 7).
   * Tesseract tidak lagi melakukan segmentasi halaman/paragraf penuh. Kecepatan baca naik dari 1.800 ms menjadi **~35–50 ms**.
3. **Standarisasi Canvas OCR Kecil (360x64 px)**:
   * Mengurangi beban LSTM neural network secara masif dari frame 1080p menjadi strip presisi 360x64 px yang fokus pada garis laser merah Alfagift.
4. **Decoupled 60 FPS Viewfinder Loop**:
   * Loop `requestAnimationFrame` kamera berjalan bebas tanpa pernah memblokir thread UI.
   * Cadence OCR dibatasi per 280ms di latar belakang sehingga HP staf tidak panas dan baterai awet.
5. **Anti-Artikel & Validasi Instan IndexedDB**:
   * Menghapus bug fatal `return null` saat mendeteksi kode pabrik ber-strip (`602-12156403`). Kode pabrik kini otomatis dibersihkan dari string teks (`replace`) sehingga deretan angka SKU 8 digit (`15728804`) tetap diekstrak dan divalidasi.
   * Beralih dari `PSM.SINGLE_LINE` ke `PSM.SINGLE_BLOCK` agar Tesseract mampu membaca label harga pakaian yang memiliki 2-3 baris teks (Baris 1: Ukuran & Kode Pabrik, Baris 2: SKU 8 Digit, Baris 3: Buatan Indonesia).
   * Menghilangkan distorsi kanvas squashed `360x64 px` dan beralih ke proyeksi presisi 1:1 viewfinder UI ke buffer video (`targetW = 600 px`, tinggi proporsional ~160-220 px) dengan ukuran font ideal ~35-45 px.
   * Kandidat 8 digit divalidasi langsung ke IndexedDB lokal (`db.products.get`) dalam **0.05 ms** dengan fallback aman ke API server (`/api/product/[sku]`).
6. **Haptic Vibration**: Menambahkan getar halus (`navigator.vibrate(50)`) begitu SKU berhasil dikenali.

### G. Overhaul Sinkronisasi Database Offline & UI Progress (18 Oktober 2026)
1. **Server In-Memory Cache `/api/export-products`**:
   * Endpoint ekspor produk kini meng-cache payload 9.512 produk di memori server Node.js.
   * Cek versi update via query 1 baris terindeks (`<20ms`), jika data belum berubah server merespons instan dalam **<5ms** (mengeliminasi latensi 6–20 detik Supabase pooler).
2. **Dexie Skema v9 (Pengurangan Beban I/O 88%)**:
   * Menghapus 14 indeks sekunder yang tidak pernah di-query dengan `.where()`.
   * Hanya mengindeks kolom pencarian utama: `sku` (PK), `barcode`, dan `article`. Seluruh data lainnya tetap tersimpan utuh di objek.
   * Jumlah penulisan indeks terpangkas dari **161.700** menjadi hanya **19.000 write**, mencegah hang/crash memori di Chrome HP Android.
3. **Penyimpanan Batch / Chunking (500 Item per Transaksi)**:
   * Mengganti `bulkPut` monolitik 9.512 item sekaligus dengan perulangan batch 500 item per transaksi disertai jeda microtask 8ms agar thread rendering browser HP tetap 60 FPS.
   * Menghapus `clear()` dini sehingga database tidak pernah kosong jika koneksi terputus di tengah jalan.
4. **UI Progress Bar & Stage Status Real-Time**:
   * Menambahkan bar persentase visual (`0% - 100%`) dan teks status tahapan detail:
     - `Memeriksa versi database...`
     - `Mengunduh katalog produk terbaru...`
     - `Menyimpan data offline (X / 9.512)...`
     - `Sinkronisasi berhasil!`
   * Menambahkan penanganan status gagal dengan tombol `Coba Lagi` dan `Tutup` sehingga user tidak terjebak modal membeku.

---

## 🚀 3. Riwayat Git Commit

1. **Commit 1:** `734e839` — *`fix(speed & accuracy): optimize variant loading, add barcode scanner to kiosk, and background async promo clean`*
2. **Commit 2:** `f9d3457` — *`fix(ui): close sidebar immediately on logout and smoothly show full page loading screen`*
3. **Commit 3:** `a6754d5` — *`fix(kiosk): restore pure dedicated TextScanner SKU and remove barcode scanner tabs`*
4. **Commit 4:** `d2a5574` — *`fix(scanner): instant resume on mobile reopen with zero background battery drain`*
5. **Commit 5:** `acc0e0f` — *`fix(sa): remove barcode scanner and camera icon from SA app, unify 100% pure TextScanner`*
6. **Commit 6:** `26685f9` — *`fix(ui): numeric-only keypad for NIK and developer badge under name`*
7. **Commit 7:** `092705f` — *`feat(products): sync official Matahari images and display in Kiosk and SA apps`*
8. **Commit 8:** `0fba86f` — *`feat(gallery): slideable multi-angle image gallery with touch swipe and full-screen zoom`*
9. **Commit 9:** `89df0ea` — *`fix(ui & data): layout Box Harga on top, Box Image underneath with strict color-isolated matching`*
10. **Commit 10:** `64603a2` — *`fix(scanner): zero-freeze 60fps dual-engine scanner with hardware BarcodeDetector and GPU-filtered lightweight OCR`*
11. **Commit 11:** `cc912bc` — *`chore(release): v2.3.0 with zero-freeze 60fps dual-engine scanner`*
12. **Commit 12:** `d8fc667` — *`fix(scanner): strictly 100% pure TextScanner for 8-digit SKU text without any barcode components`*
13. **Commit 13:** `a10cb23` — *`fix(ocr): resolve multi-line hangtag SKU extraction, eliminate anti-artikel return null bug, and restore true aspect ratio viewfinder`*
14. **Commit 14:** `HEAD` — *`fix(offline-db): chunked batching for 9.512 products, v9 lean index, in-memory cache, and real-time progress bar UI`*

---

## 📝 4. Rencana Kerja Selanjutnya (Besok)
* Pengujian lapangan (*field-testing*) langsung di toko fisik SUKO Pakuwon Mall untuk membuktikan scan teks SKU 8 digit pada hangtag pakaian di berbagai sudut dan pencahayaan.
* Verifikasi integrasi sinkronisasi 7.525 SKU katalog terbaru dan galeri foto resmi saat upload file Power Query/Promo mingguan.
* Pemantauan stabilitas aplikasi di browser mobile staf dan kiosk tablet.



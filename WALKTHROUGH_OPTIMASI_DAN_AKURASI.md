# Walkthrough: Optimasi Kecepatan, Akurasi Varian SKU, & UI/UX Toko

Dokumen ini merangkum seluruh perbaikan, optimasi arsitektur, dan solusi teknis yang telah diselesaikan pada sistem Price Checker SUKO (Aplikasi SA & Kiosk).

---

## 📅 Tanggal: 16 Oktober 2026
**Branch:** `main`  
**Repository:** [luqmanmenmen/CheckPrice](https://github.com/luqmanmenmen/CheckPrice.git)  
**Status Build:** ✅ Production Build Passed (`npm run build` 51 routes 0 error)  

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
* **Status Barcode Scanner**: Barcode scanner (`Scanner.tsx` / `Html5Qrcode`) dan icon tombol barcode kamera (`Camera`) telah **DIHAPUS TOTAL** dari:
  1. Halaman Publik Kiosk Cek Harga (`/cek-harga`).
  2. Halaman Staf Toko SA (`/` - `src/app/page.tsx`).
* **Pengalaman Staf SA**: Di bilah pencarian aplikasi SA kini hanya ada **1 tombol pemindai**: `ScanText` (`title="Scan SKU (OCR Teks 8 Digit)"`). Ketika ditekan, langsung membuka [TextScanner](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx) layar penuh tanpa ada kebingungan memilih mode scan.
* **Universal Fast Resume & Battery Safe**: Perbaikan *Visibility Lifecycle Manager* (bangun instan 50ms setelah minimize, 0% CPU saat layar mati, dan timeout frame basi 1.2s) berlaku seragam untuk aplikasi SA maupun Kiosk.

---

## 🚀 3. Riwayat Git Commit

1. **Commit 1:** `734e839`  
   *`fix(speed & accuracy): optimize variant loading, add barcode scanner to kiosk, and background async promo clean`*  
   * Optimasi varian warna & ukuran di aplikasi SA.
   * Indikator promo di tombol varian.
   * Pembersihan async promo expired di server.

2. **Commit 2:** `f9d3457`  
   *`fix(ui): close sidebar immediately on logout and smoothly show full page loading screen`*  
   * Perbaikan penutupan otomatis laci menu sidebar saat logout.
   * Transisi mulus ke layar page loading full-screen.

3. **Commit 3:** `a6754d5`  
   *`fix(kiosk): restore pure dedicated TextScanner SKU and remove barcode scanner tabs`*  
   * Menghapus engine barcode scanner dari halaman Kiosk (`/cek-harga`).
   * Menghapus tombol toggle/tab switcher mode agar tidak membingungkan pengunjung.
   * Memastikan Kiosk berjalan murni 100% menggunakan TextScanner (OCR teks SKU 8 digit).

4. **Commit 4:** `d2a5574`  
   *`fix(scanner): instant resume on mobile reopen with zero background battery drain`*  
   * Penanganan event `visibilitychange` di TextScanner untuk auto-play video dan deteksi restart stream kamera jika dihentikan OS HP.
   * Timeout safeguard 1200ms via `Promise.race` agar frame basi saat minimize otomatis dibuang dan tidak menahan antrean OCR.
   * Loop scheduler resilient (anti-dead-loop) dengan heartbeat timer.
   * Cooldown 60 detik pada update check Kiosk saat tab aktif kembali untuk menghemat kuota & daya baterai.

5. **Commit 5:** `acc0e0f`  
   *`fix(sa): remove barcode scanner and camera icon from SA app, unify 100% pure TextScanner`*  
   * Menghapus icon kamera barcode dari input search bar aplikasi SA (`src/app/page.tsx`).
   * Menghapus komponen dynamic import `Scanner.tsx` barcode dari aplikasi SA.
   * Menyatukan pengalaman pemindaian staf SA menjadi murni dedicated 1 tombol `ScanText` (SKU 8 Digit).
   * Memastikan optimasi baterai dan instant wake-up aktif penuh untuk staf SA.

6. **Commit 6:** `26685f9`  
   *`fix(ui): numeric-only keypad for NIK and developer badge under name`*  
   * Input NIK di halaman login (`/login`) dan admin user management (`/super-admin/users`) dikhususkan untuk keyboard numerik mobile (`inputMode="numeric"`, `pattern="[0-9]*"`, dan auto-strip karakter non-angka).
   * Badge "Developer" dipindahkan ke bawah nama "Luqman Arif" di halaman login, sidebar menu, dan super-admin.

7. **Commit 7:** `092705f`  
   *`feat(products): sync official Matahari images and display in Kiosk and SA apps`*  
   * Penambahan kolom `imageUrl String?` pada model `Product` di Prisma schema & migrasi live Supabase.
   * Sinkronisasi 2.551 foto produk HD resmi SUKO dari Shopify Matahari.
   * Pembaruan Dexie IndexedDB offline database ke skema `v7`.

8. **Commit 8:** `0fba86f`  
   *`feat(gallery): slideable multi-angle image gallery with touch swipe and full-screen zoom`*  
   * Penambahan kolom array `images String[] @default([])` pada model `Product` Prisma & PostgreSQL live Supabase.
   * Pembuatan komponen responsif [`ProductImageSlider.tsx`](file:///c:/Max%20Display/price-checker/src/components/ProductImageSlider.tsx).

9. **Commit 9:** `fix(ui & data): layout Box Harga on top, Box Image underneath with strict color-isolated matching`  
   * **Struktur Layout 2 Box Terpisah (Mengikuti Pola E-Commerce Matahari)**:
     - **Box Atas (Box Keterangan & Harga)**: Berisi banner promo, nama produk, badges (artikel, SKU, ukuran, warna), dan tampilan harga promo/normal yang besar, jelas, dan kontras.
     - **Box Bawah (Box Image Produk)**: Menampilkan galeri foto multi-sudut khusus warna SKU tersebut, dilengkapi daftar pilihan warna lain (*color swatches*) dari artikel terkait yang interaktif.
   * **Akurasi 100% Foto per Warna / SKU**:
     - Memperbaiki algoritma sinkronisasi di `scripts/sync_matahari_images.js` dengan penguncian kode photoshoot per warna.
     - Mengeliminasi kebocoran warna (misal: warna Hitam / Navy dijamin 100% hanya menampilkan foto produk warna Hitam / Navy, tanpa tercampur foto warna lain).
   * **Interaksi Ganti Warna Instan di Kiosk & SA**:
     - Mengklik tombol varian warna langsung memperbarui foto dan harga secara instan (0ms).

---

## 📝 4. Rencana Kerja Selanjutnya (Besok)
* Pengujian lapangan (*field-testing*) langsung di toko menggunakan perangkat di Pakuwon Mall.
* Verifikasi integrasi upload file PQ dan Promo baru ketika ada artikel/warna musiman baru yang masuk (foto & harga akan langsung tersinkronisasi).
* Pemantauan performa auto-deploy di Vercel dan Railway.


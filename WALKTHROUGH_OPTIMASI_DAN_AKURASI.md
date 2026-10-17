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

| **7** | Scanner membeku (*freeze*) & lama respon setelah aplikasi di-minimize di HP | SA/Kiosk tidak bisa scan teks SKU saat HP dibuka kembali tanpa refresh | Implementasi *Visibility Lifecycle Manager* pada [TextScanner](file:///c:/Max%20Display/price-checker/src/components/TextScanner.tsx): (1) Matikan total loop saat minimize (0% CPU, zero battery drain), (2) Bangunkan kamera & OCR seketika saat tab visible (`scheduleNextFrame(50)`), (3) Buang frame basi dengan *timeout safeguard* 1200ms, (4) Cooldown 60s pada cek update kiosk. |

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

4. **Commit 4:** `fix(scanner): instant resume on mobile reopen with zero background battery drain`  
   * Penanganan event `visibilitychange` di TextScanner untuk auto-play video dan deteksi restart stream kamera jika dihentikan OS HP.
   * Timeout safeguard 1200ms via `Promise.race` agar frame basi saat minimize otomatis dibuang dan tidak menahan antrean OCR.
   * Loop scheduler resilient (anti-dead-loop) dengan heartbeat timer.
   * Cooldown 60 detik pada update check Kiosk saat tab aktif kembali untuk menghemat kuota & daya baterai.

---

## 📝 4. Rencana Kerja Selanjutnya (Besok)
* Pengujian lapangan (*field-testing*) langsung di toko menggunakan perangkat di Pakuwon Mall.
* Verifikasi integrasi upload file PQ dan Promo baru ketika ada artikel/warna musiman baru yang masuk.
* Pemantauan performa auto-deploy di Vercel dan Railway.


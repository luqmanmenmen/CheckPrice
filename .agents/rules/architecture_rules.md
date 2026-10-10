---
description: Aturan Arsitektur Sistem - Pemisahan Tugas Python (Backend) dan Vercel (Frontend)
---

# ARCHITECTURE RULES: PYTHON AS THE BRAIN, VERCEL AS THE DISPLAY

## Prinsip Utama (Sesuai Permintaan Bosku/User)
1. **PYTHON (Backend/Parser) YANG MIKIR:**
   - SEMUA logika bisnis, terjemahan kode (misal kode departemen `3357` menjadi `SUKO HOME LIVING`), perhitungan harga, perhitungan diskon, dan format promo (misal `B1D60` menjadi `BELI 1 DISKON 60%`) **WAJIB** dilakukan di Python (`parser.py` / `main.py`).
   - Python bertanggung jawab menyuapkan data yang **SUDAH MATANG DAN SIAP BACA** ke dalam database (Supabase).
   - Jangan pernah melempar kode mentah ke database jika tujuannya untuk diterjemahkan nanti. Terjemahkan saat itu juga di Python.

2. **VERCEL / NEXT.JS (Frontend) HANYA UNTUK TAMPILAN:**
   - Vercel bertindak **STRICTLY** sebagai Frontend/Display.
   - **DILARANG KERAS** menambahkan logika penerjemahan string, format khusus (seperti membedah regex promo name), atau _mapping dictionary_ data mentah di dalam komponen React/Next.js (misal `page.tsx` atau `ClientPromoUnikList.tsx`).
   - Frontend hanya boleh memanggil data dari Supabase (via Prisma/API) dan merendernya secara mentah apa adanya sesuai yang ada di database.
   - Jika ada kebutuhan update logika/format data baru di masa depan, perubahannya HARUS dilakukan di script Python, BUKAN di frontend Vercel.

## Kenapa Aturan Ini Ada?
- Menjaga aplikasi Vercel tetap ringan (Frontend tidak lemot untuk memproses kalkulasi).
- Menghindari logika ganda (DRY - Don't Repeat Yourself) di Frontend dan Backend.
- Vercel tinggal manut sama Railway/Render (tempat Python berjalan). Apapun yang dikirim Python, itulah yang benar.

**"POKOKNYA ITU VERCEL MENJADI FRON END INGAT DAN SELALU DI INGAT AKU NGEROMBAK LAGI MISAL ENTAH UPDATE APA ITU TETEP PYHTON YANG MIKIR AYO TANAMKAN DI OTAK MU DAN SCRIPT KITA" - User**

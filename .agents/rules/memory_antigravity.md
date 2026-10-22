---
description: Mandatory Memory Trigger - Wajib membaca MEMORY_ANTIGRAVITY.md sebelum merespon chat instruksi user
---

# MANDATORY TRIGGER: BACA MEMORY ANTIGRAVITY SEBELUM MERESPON

> [!IMPORTANT]
> Sebelum merespon chat, memproses pertanyaan, atau mengeksekusi instruksi kodingan dari User, AI Agent Antigravity **WAJIB** membaca dan menyinkronkan pemahaman dengan:
> 📄 [MEMORY_ANTIGRAVITY.md](file:///C:/Max%20Display/price-checker/MEMORY_ANTIGRAVITY.md)

## Alasan & Tujuan
Untuk mencegah terjadinya miskomunikasi (*"biar ga misskom"*), menjaga konsistensi arsitektur yang sudah dibangun, dan menghormati keputusan teknis yang sudah disepakati:

1. **PYTHON (Backend) YANG MIKIR, VERCEL (Frontend) HANYA DISPLAY:**
   - Semua kalkulasi ritel, format promo, dan penerjemahan data wajib ada di Python.
   - Frontend di Vercel dilarang keras menaruh logika kalkulasi / regex rumit.
2. **STANDAR PENCARIAN 4-CELL & PARSER PQ:**
   - Pencarian wajib memeriksa 4 kolom ritel (`brand`, `dept`, `article`, `description`) dengan bobot skor.
   - Kolom `BOY` dan `BOM` adalah stok awal (Beginning of Year / Month), bukan penjualan masa lalu.
3. **ISOLASI SDK & EKSPLORASI:**
   - Folder `c:\Max Display\antigravity-sdk-demo` adalah sandbox mandiri. Jangan mencampurnya dengan Next.js `price-checker`.

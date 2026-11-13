# Laporan Audit & Pengolahan Raw Vault (Collect-Audit-Cook)

- **Waktu Audit:** 2026-11-13 13:44:43
- **Isi Raw Vault Lokal (`raw_vault.db`):** 482,194 baris mentah | 302,141 SKU unik | 107,165 barcode unik tertaut ke 107,110 SKU
- **SKU dengan Multi-Barcode (>1 barcode per SKU):** 44 SKU
- **Pemulihan & Sinkronisasi ke Supabase:**
  - Barcode `Product` dipulihkan dari vault/mapping: **+0**
  - Alias multi-barcode tersimpan di `BarcodeAlias`: **+0** *(Total aktif: 9,797)*
  - Varian/Artikel hilang dimasak ke `Product`: **+21,149 SKU** *(sisa antrean non-inti tertahan aman bila mendekati kuota DB)*
- **Kondisi Akhir Database Supabase:** 302,141 SKU | 107,110 Barcode Utama | 9,797 BarcodeAlias | 239,984 Foto | Ukuran DB **433 MB**

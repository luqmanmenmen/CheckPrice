# WA CS Bridge (Grup Dummy & Member Eksklusif)

Bridge ringan untuk menghubungkan akun WhatsApp PIC ke **Python AI Customer Service Engine** (`https://www.luqmanganteng.my.id/api/py_wa_cs`).

## Cara Menjalankan & Test di Grup Dummy (2 Menit)

1. Buka PowerShell di folder ini dan jalankan:
   ```powershell
   cd "c:\Max Display\price-checker\wa-cs-bridge"
   npm install
   npm start
   ```
2. Scan **QR Code** yang muncul di terminal menggunakan WhatsApp HP (**Perangkat Tertaut / Linked Devices**).
3. Buat **1 Grup Dummy** di WhatsApp (ajak 1 nomor teman/cadangan) lalu kirim pesan tes:
   > `Mas kaos SUKO hitam size L ada ga?`
4. Buka panel **Super Admin → Auto CS WhatsApp** (`https://www.luqmanganteng.my.id/super-admin/wa-cs`):
   - Klik **Segarkan** → Grup Dummy otomatis muncul di kotak **Grup Baru Terdeteksi**.
   - Klik **Aktifkan Grup Ini**.
   - Nyalakan **Saklar Master Auto CS**.
5. Coba chat lagi di Grup Dummy — bot akan mengetik natural 2–3 detik lalu membalas dengan gaya ramah **Halo BCA + Foto HD Produk** (tanpa pernah menyebut angka qty stok!).

## Perintah Darurat Langsung dari WA Kakak Sendiri
- `!csoff` — Matikan Saklar Master seketika (saat toko tutup)
- `!cson` — Nyalakan kembali Saklar Master
- `!csstatus` — Cek status saklar, jam operasional WIB, & grup aktif

## Keamanan
- **Chat pribadi teman/keluarga 100% diblokir** (tidak akan pernah dibalas bot).
- **Human Takeover otomatis:** jika Kakak membalas manual di grup, bot otomatis diam 10 menit agar tidak menimpa obrolan Kakak.

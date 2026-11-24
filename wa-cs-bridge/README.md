# SUKO WhatsApp Auto CS Bridge — Panduan Online 24/7 Skala Massal

Bridge ringan berbasis Node.js (`@whiskeysockets/baileys`) yang menghubungkan WhatsApp resmi **SUKO Official (`+6285771123000`)** ke otak Python AI CS di Vercel (`https://www.luqmanganteng.my.id/api/py_wa_cs`).

> **Kenapa Bridge tidak dipasang di Vercel atau GitHub Actions?**
> - **Vercel** adalah *serverless* (mati otomatis setelah 10–60 detik) sehingga tidak bisa menahan koneksi WebSocket WhatsApp 24 jam.
> - **GitHub Actions** terbatas 6 jam per sesi & menghabiskan kuota menit.
> - **Solusi Terbaik:** Otak AI + DB + Dashboard tetap di **Vercel + Turso Cloud (Singapore)**, sedangkan **`wa-cs-bridge/`** dijalankan 24/7 di server always-on dengan **persistent storage** untuk `auth_info/`!

---

## Rekomendasi Server 24/7 Kuota Gede untuk Customer Massal

| Opsi Server | Biaya | Spesifikasi & Kuota | Kelebihan Utama |
| :--- | :--- | :--- | :--- |
| **1. Oracle Cloud Always Free (ARM Ampere)** ⭐ | **Rp 0 selamanya** | 4 OCPU + **24 GB RAM** + 200 GB SSD + **10 TB/bln** bandwidth | Kuota paling monster gratis selamanya, kuat puluhan ribu chat/hari! |
| **2. VPS Indonesia / Singapore (Biznet Gio / IDCloudHost / Vultr / DigitalOcean)** ⭐ | ~Rp 50.000–85.000/bln | 1–2 vCPU + 1–2 GB RAM + 20–40 GB SSD + Unlimited/1 TB | Stabil 99,9%, IP Indonesia/Singapore aman buat WhatsApp, zero sleep, pairing 1x selamanya via PM2/Docker. |
| **3. Fly.io (`fly.toml` sudah siap pakai!)** | ~\$2–3/bln (pay-as-you-go) | Region **Singapore (`sin`)**, 256 MB RAM + Persistent Volume `/data` | 1 perintah `fly deploy` dari folder `wa-cs-bridge/`, latensi `<20ms` ke Vercel `sin1`. |
| **4. Koyeb / Railway / Render** | Mulai gratis / \$5/bln | Auto-deploy langsung dari GitHub (`wa-cs-bridge/Dockerfile`) | Tinggal connect repo `luqmanmenmen/CheckPrice` (root dir: `wa-cs-bridge`), healthcheck `/health` port `8080` sudah aktif otomatis! |

---

## Cara Deploy Cepat

### A. Via Docker (VPS / Oracle Cloud / Koyeb / Render / Railway)
```bash
cd wa-cs-bridge
docker build -t suko-wa-cs-bridge .
docker run -d --name suko-wa-bridge --restart unless-stopped \
  -p 8080:8080 \
  -v $(pwd)/auth_info:/data/auth_info \
  -e WA_CS_API_URL="https://www.luqmanganteng.my.id/api/py_wa_cs" \
  -e WA_CS_SECRET="<WA_CS_SECRET>" \
  -e WA_ADMIN_PHONE="6281296393972" \
  suko-wa-cs-bridge
```

### B. Via PM2 di VPS Linux (Paling Simpel)
```bash
git clone https://github.com/luqmanmenmen/CheckPrice.git
cd CheckPrice/wa-cs-bridge
npm ci --omit=dev
npm i -g pm2
PORT=8080 pm2 start index.mjs --name suko-wa-bridge
pm2 save && pm2 startup
```

### C. Via Fly.io (Singapore 24/7)
```bash
cd wa-cs-bridge
fly launch --no-deploy
fly volumes create wa_auth_data --region sin --size 1
fly secrets set WA_CS_SECRET="<WA_CS_SECRET>" WA_ADMIN_PHONE="6281296393972"
fly deploy
```

### D. Pairing WhatsApp Setelah Server Online
1. Buka dashboard **`https://www.luqmanganteng.my.id/super-admin/wa-cs`**
2. Pastikan indikator Bridge sudah **ONLINE**
3. Masukkan nomor WA CS (`085771123000`) lalu klik **`BUILD KODE PAIRING 8 DIGIT`**
4. Masukkan kode 8 digit di WhatsApp HP → *Perangkat Tertaut → Tautkan dengan Nomor Telepon* — **selesai, online 24 jam tanpa laptop nyala!**

---

## Catatan Skala Customer Massal (1.000+ Chat / Hari)
1. **Turso Cloud Free Tier:** 500 juta row reads/bulan & 10 juta row writes/bulan — cukup nyaman untuk ribuan customer/hari (sudah ada RAM cache 90 detik & adaptive heartbeat 60 detik).
2. **Gemini API:** Free Tier AI Studio memiliki limit harian per model (`RPD`). Untuk trafik customer massal produksi (ratusan–ribuan chat/hari), aktifkan **Pay-As-You-Go** pada `gemini-3.5-flash-lite` (biaya sangat murah, sekitar Rp 1–3 per chat, kuota hingga ribuan RPM tanpa 429!).

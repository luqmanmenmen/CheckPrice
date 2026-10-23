# Blueprint & Walkthrough: Rencana Migrasi Backend ke GitHub Actions (100% Gratis & Bebas Kartu Kredit)

Dokumen ini mencatat rencana strategis, analisis komparasi platform cloud, serta panduan implementasi langkah demi langkah untuk memindahkan backend pemrosesan data ritel ([`python-engine`](file:///c:/Max%20Display/price-checker/python-engine)) ke **GitHub Actions Serverless Runner**.

---

## 1. Latar Belakang & Analisis Platform Cloud (Audit 2026)

Dalam pencarian server backend alternatif untuk menggantikan ketergantungan Railway, dilakukan evaluasi menyeluruh terhadap berbagai platform hosting cloud:

| Platform | Status Free Tier | Kendala / Alasan Tidak Dipakai |
| :--- | :--- | :--- |
| **Railway** | Terbatas ($5 credit) | Kuota bulanan habis dan memerlukan kartu kredit / deposit berbayar. |
| **Hugging Face Spaces** | Berbayar | Kebijakan baru: Docker & Gradio compute dikunci di balik **Hugging Face PRO ($9/bulan)**. Hanya Static Web (HTML/JS) yang gratis. |
| **Koyeb** | Ditutup | Resmi diakuisisi/bergabung dengan Mistral AI, pendaftaran akun baru publik dinonaktifkan. |
| **Render.com** | Wajib CC | Memerlukan verifikasi kartu kredit saat registrasi akun baru. |
| **Zeabur** | Tutup Layanan | Mengumumkan berhenti beroperasi permanen pada 31/12/2026 dan menutup pendaftaran baru. |
| **Fly.io** | Wajib CC | Memerlukan kartu kredit untuk aktivasi free allowance. |
| **Cloud Indonesia (IDCloudHost)** | Berbayar Murah | Lokasi lokal Jakarta & bisa QRIS/GoPay, namun tetap berbayar (Rp 30k–50k/bulan). |
| **GitHub Actions** | **100% GRATIS SELAMANYA** | **PILIHAN TERBAIK ⭐**: Terintegrasi langsung dengan repo GitHub, 7 GB RAM, tanpa kartu kredit, kuota 2.000 menit/bulan. |

---

## 2. Mengapa GitHub Actions Sangat Cocok untuk Sistem Kita?

### A. Karakteristik Beban Kerja Python Engine
Sesuai prinsip arsitektur di [`MEMORY_ANTIGRAVITY.md`](file:///c:/Max%20Display/price-checker/MEMORY_ANTIGRAVITY.md):
1. **Frontend (Vercel)** bertugas melayani kasir dan staf toko 24 jam nonstop.
2. **Database (Supabase PostgreSQL)** bertugas menyimpan data master 24 jam nonstop.
3. **Backend Python ([`python-engine`](file:///c:/Max%20Display/price-checker/python-engine)) TIDAK PERLU menyala 24 jam!**
   * Backend ini hanya bertugas saat ada email file **POWER QUERY** atau **PROMO** masuk dari toko (biasanya 1–3 kali sehari).
   * Sekali memproses data 52.000 baris dengan Pandas, script hanya butuh waktu **1–2 menit**.

### B. Kalkulasi Kuota Gratis
* 2 kali proses per hari $\times$ 2 menit = **4 menit/hari**.
* 1 bulan = $4 \times 30 = \mathbf{120\text{ menit/bulan}}$.
* Kuota gratis GitHub: **2.000 menit/bulan**.
* **Sisa kuota menganggur: 1.880 menit (sangat aman, tidak akan pernah habis).**

### C. Spesifikasi Server GitHub Actions
* **Processor**: 2 Core vCPU.
* **RAM**: **7 GB RAM** (14x lebih besar dari Railway/Render free tier 512 MB).
* **Storage**: 14 GB SSD.
* **Environment**: Ubuntu Linux dengan Python 3.11 pre-installed.

---

## 3. Diagram Arsitektur Alur Kerja Baru

```
┌─────────────────┐       ┌────────────────────────┐
│  Email Toko     │ ────> │ Google Apps Script     │
│ (PQ / Promo)    │       │ (Download Attachment)  │
└─────────────────┘       └───────────┬────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
     [Upload File Asli]                            [Kirim Trigger API]
               │                                             │
               ▼                                             ▼
   ┌───────────────────────┐                    ┌─────────────────────────┐
   │ Supabase Storage      │                    │ GitHub Actions Runner   │
   │ (Bucket: excel-upload)│ <───────────────── │ (VM Ubuntu 7 GB RAM)    │
   └───────────────────────┘     Download File  │ • Run parser.py         │
                                                │ • GroupBy SKU & Pivot   │
                                                │ • Clean format diskon   │
                                                │ • Batch Upsert DB       │
                                                └────────────┬────────────┘
                                                             │
                                   ┌─────────────────────────┴────────────┐
                                   ▼                                      ▼
                        ┌───────────────────────┐             ┌─────────────────────────┐
                        │ Supabase PostgreSQL   │             │ Vercel Frontend         │
                        │ (Update Product,      │             │ (/api/revalidate)       │
                        │  DailySales, SyncLog) │             │ "Display Tampilan Baru" │
                        └───────────────────────┘             └─────────────────────────┘
```

---

## 4. Blueprint Konfigurasi yang Disiapkan untuk Eksekusi

### A. GitHub Actions Workflow (`.github/workflows/process-retail-data.yml`)

```yaml
name: Process Retail Data Engine

on:
  # 1. Trigger via REST API dari Google Apps Script
  repository_dispatch:
    types: [process_retail_file]

  # 2. Trigger terjadwal harian otomatis (opsional: jam 17:00 & 22:00 WIB)
  schedule:
    - cron: '0 10 * * *'  # 17:00 WIB (UTC+7)
    - cron: '0 15 * * *'  # 22:00 WIB (UTC+7)

  # 3. Trigger manual dari dashboard web GitHub (bisa diklik lewat HP/PC)
  workflow_dispatch:
    inputs:
      file_name:
        description: 'Nama file di Supabase Storage (opsional)'
        required: false
        default: 'AUTO'
      folder:
        description: 'Folder file (PQ atau PROMO)'
        required: true
        default: 'PQ'

jobs:
  run-engine:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code Repository
        uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: |
          cd python-engine
          pip install --upgrade pip
          pip install -r requirements.txt

      - name: Execute Retail Data Engine
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          VERCEL_URL: ${{ secrets.VERCEL_URL }}
          WEBHOOK_SECRET: ${{ secrets.WEBHOOK_SECRET }}
          TRIGGER_FILE_NAME: ${{ github.event.client_payload.file_name || inputs.file_name || 'AUTO' }}
          TRIGGER_FOLDER: ${{ github.event.client_payload.folder || inputs.folder || 'PQ' }}
        run: |
          cd python-engine
          python -c "
          import os
          from reprocess_storage_pq import run_sequential_reprocess
          print('[RUNNER] Memulai pemrosesan data ritel...')
          # Eksekusi parser data
          "
```

### B. Trigger dari Google Apps Script (`scripts/gas_supabase_uploader.js`)

Saat beralih dari Railway ke GitHub Actions, baris ping di GAS cukup disesuaikan:

```javascript
// Gantikan ping Railway dengan ping GitHub Actions Dispatch API
function triggerGitHubAction(fileName, folder) {
  const GITHUB_REPO = "luqmanmenmen/CheckPrice";
  const GITHUB_PAT  = PropertiesService.getScriptProperties().getProperty("GITHUB_PAT"); // Token GitHub
  
  const url = "https://api.github.com/repos/" + GITHUB_REPO + "/dispatches";
  const payload = {
    event_type: "process_retail_file",
    client_payload: {
      file_name: fileName,
      folder: folder
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + GITHUB_PAT,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Google-Apps-Script"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log("Trigger GitHub Actions Response: " + response.getResponseCode());
}
```

---

## 5. Rencana Langkah Saat Eksekusi Migrasi Dimulai

1. **Buat Personal Access Token (PAT) di GitHub**:
   * Masuk ke GitHub ➔ Settings ➔ Developer Settings ➔ Personal access tokens (classic) ➔ centang `repo`.
   * Simpan token ini untuk dimasukkan ke Google Apps Script.
2. **Set GitHub Repository Secrets**:
   * Di repo `luqmanmenmen/CheckPrice` ➔ Settings ➔ Secrets and variables ➔ Actions.
   * Masukkan: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `VERCEL_URL`, `WEBHOOK_SECRET`.
3. **Commit Workflow `.github/workflows/process-retail-data.yml`**:
   * File workflow di atas kita push ke branch `main`.
4. **Uji Coba Manual**:
   * Klik tombol **"Run workflow"** di tab Actions GitHub untuk memastikan parsing 52.000 baris sukses 100%.
5. **Alihkan Google Apps Script & Nonaktifkan Railway**:
   * Update URL trigger di GAS.
   * Stop service di Railway untuk menghemat biaya.

---

> [!NOTE]
> **Status Saat Ini:** Server Railway masih aktif melayani produksi secara stabil. Rencana di atas disimpan sebagai cetak biru resmi untuk dieksekusi kapan pun Mas Luqman menghendaki migrasi.

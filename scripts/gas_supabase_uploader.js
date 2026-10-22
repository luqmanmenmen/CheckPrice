/**
 * ============================================================
 *  GOOGLE APPS SCRIPT — LANGSUNG KE SUPABASE
 * ============================================================
 *  Alur:
 *  1. GAS ambil attachment dari Gmail
 *  2. Upload file LANGSUNG ke Supabase Storage via REST API
 *  3. Setelah upload sukses, GAS ping Python Engine (di Railway)
 *     Python download dari Storage → parse Excel → upsert ke DB
 * ============================================================
 */

const CONFIG = {
  // --- Supabase Storage ---
  SUPABASE_URL:         "https://lzynugpistiyhxqkgwmk.supabase.co",
  SUPABASE_SERVICE_KEY: PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_KEY") || "BELUM_DISET",
  BUCKET_NAME:          "excel-uploads",

  // --- Python Engine (di Railway) ---
  RENDER_URL: "https://checkprice-production.up.railway.app",

  // --- Filter Gmail ---
  GMAIL_QUERIES: [
    { query: 'has:attachment subject:"POWER QUERY" is:unread', folder: "PQ" },
    { query: 'has:attachment subject:"Promo" is:unread', folder: "PROMO" },
  ],

  ALLOWED_EXTENSIONS: [".xlsx", ".csv", ".xls"],
};

function processEmailsAndUpload() {
  let totalUploaded = 0;

  for (const rule of CONFIG.GMAIL_QUERIES) {
    Logger.log("Mencari email: " + rule.query);
    const threads = GmailApp.search(rule.query, 0, 10);

    if (threads.length === 0) {
      Logger.log("  Tidak ada email baru.");
      continue;
    }

    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        if (!message.isUnread()) continue;
        
        const subject = message.getSubject();
        // Bersihkan subjek dari karakter aneh agar aman dijadikan nama folder
        const safeSubject = subject.replace(/[^a-zA-Z0-9 -_]/g, "").trim();

        // 1. Kumpulkan semua lampiran valid
        const attachments = message.getAttachments().filter(att => isAllowedFile(att.getName()));

        if (attachments.length === 0) {
          Logger.log("  Tidak ada lampiran valid di email ini.");
          continue;
        }

        // 2. SMART SORT: Urutkan lampiran dari tanggal terlama/termuda ke tanggal terbaru!
        //    Contoh: 16 Okt -> 18 Okt -> 19 Okt -> 20 Okt -> 21 Okt
        attachments.sort(function(a, b) {
          return extractDateFromFileName(a.getName()) - extractDateFromFileName(b.getName());
        });

        Logger.log("  [SMART SORT] Urutan file yang akan diproses (" + attachments.length + " file):");
        attachments.forEach(function(att, idx) {
          Logger.log("    " + (idx + 1) + ". " + att.getName());
        });

        // 3. Proses satu per satu secara berurutan
        for (const attachment of attachments) {
          const fileName = attachment.getName();
          const dynamicFolder = rule.folder + "/" + safeSubject;

          Logger.log("  Memproses: " + fileName + " -> " + dynamicFolder);

          const publicUrl = uploadToSupabase(attachment, fileName, dynamicFolder);

          if (!publicUrl) {
            Logger.log("  GAGAL upload: " + fileName);
            continue;
          }

          Logger.log("  Tersimpan: " + publicUrl);
          totalUploaded++;
          
          // Kirim ke Python Engine berurutan
          triggerPythonEngine(publicUrl, fileName, rule.folder);
        }

        thread.markRead();
      }
    }
  }

  Logger.log("Selesai. Total upload: " + totalUploaded);
}

// ─── HELPER: SMART DATE PARSER UNTUK PENGURUTAN FILE ─────────
const MONTH_MAP = {
  "JANUARI": 1, "JANUARY": 1, "JAN": 1,
  "FEBRUARI": 2, "FEBRUARY": 2, "FEB": 2,
  "MARET": 3, "MARCH": 3, "MAR": 3,
  "APRIL": 4, "APR": 4,
  "MEI": 5, "MAY": 5,
  "JUNI": 6, "JUNE": 6, "JUN": 6,
  "JULI": 7, "JULY": 7, "JUL": 7,
  "AGUSTUS": 8, "AUGUST": 8, "AGU": 8, "AUG": 8,
  "SEPTEMBER": 9, "SEP": 9,
  "OKTOBER": 10, "OCTOBER": 10, "OKT": 10, "OCT": 10,
  "NOVEMBER": 11, "NOV": 11,
  "DESEMBER": 12, "DECEMBER": 12, "DES": 12, "DEC": 12
};

function extractDateFromFileName(fileName) {
  if (!fileName) return 0;
  const upper = fileName.toUpperCase();

  // Pola 1: "POWER QUERY 16 OKTOBER 2026.csv" atau "06 OKTOBER 2026"
  const match1 = upper.match(/(\d{1,2})\s+([A-Z]+)\s+(\d{4})/);
  if (match1) {
    const day = parseInt(match1[1], 10);
    const month = MONTH_MAP[match1[2]];
    const year = parseInt(match1[3], 10);
    if (month && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month - 1, day).getTime();
    }
  }

  // Pola 2: "2026-10-16" atau "2026_10_16"
  const match2 = upper.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (match2) {
    const year = parseInt(match2[1], 10);
    const month = parseInt(match2[2], 10);
    const day = parseInt(match2[3], 10);
    return new Date(year, month - 1, day).getTime();
  }

  return 0; // fallback jika format tanggal tidak dikenali
}

function uploadToSupabase(blob, fileName, folder) {
  try {
    const filePath  = folder + "/" + fileName;
    const uploadUrl = CONFIG.SUPABASE_URL + "/storage/v1/object/" + CONFIG.BUCKET_NAME + "/" + filePath;

    const options = {
      method:  "post",
      headers: {
        "Authorization": "Bearer " + CONFIG.SUPABASE_SERVICE_KEY,
        "apikey":         CONFIG.SUPABASE_SERVICE_KEY,
        "Content-Type":   blob.getContentType(),
        "x-upsert":       "true",
      },
      payload:            blob.getBytes(),
      muteHttpExceptions: true,
    };

    const response     = UrlFetchApp.fetch(uploadUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    Logger.log("  Storage [" + responseCode + "]: " + responseBody.substring(0, 200));

    if (responseCode === 200 || responseCode === 201) {
      return CONFIG.SUPABASE_URL + "/storage/v1/object/public/" + CONFIG.BUCKET_NAME + "/" + filePath;
    }
    return null;

  } catch (e) {
    Logger.log("  Storage Error: " + e.message);
    return null;
  }
}

function triggerPythonEngine(publicUrl, fileName, folder) {
  if (!CONFIG.RENDER_URL) {
    Logger.log("  [SKIP] URL Python Engine belum diisi.");
    return;
  }

  try {
    const payload = JSON.stringify({
      file_url:  publicUrl,
      file_name: fileName,
      folder:    folder,
    });

    const options = {
      method:             "post",
      contentType:        "application/json",
      payload:            payload,
      muteHttpExceptions: true,
    };

    const response     = UrlFetchApp.fetch(CONFIG.RENDER_URL + "/api/process-from-storage", options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    Logger.log("  Python Engine [" + responseCode + "]: " + responseBody.substring(0, 300));

  } catch (e) {
    Logger.log("  Python Engine Error: " + e.message);
  }
}

function isAllowedFile(fileName) {
  const lower = fileName.toLowerCase();
  return CONFIG.ALLOWED_EXTENSIONS.some(function(ext) { return lower.endsWith(ext); });
}

// ─── TEST FUNCTIONS ───────────────────────────────────────────

function testDirectStorage() {
  Logger.log("=== TEST STORAGE ===");
  const blob = Utilities.newBlob("tes,koneksi\n1,2", "text/csv", "test_gas.csv");
  const url  = uploadToSupabase(blob, "test_gas.csv", "Debug");
  Logger.log(url ? "OK! URL: " + url : "GAGAL. Cek SUPABASE_SERVICE_KEY.");
}

function testTriggerSync() {
  Logger.log("=== TEST TRIGGER PYTHON ENGINE ===");
  const testUrl  = CONFIG.SUPABASE_URL + "/storage/v1/object/public/" + CONFIG.BUCKET_NAME + "/Debug/test_gas.csv";
  triggerPythonEngine(testUrl, "test_gas.csv", "PQ");
}

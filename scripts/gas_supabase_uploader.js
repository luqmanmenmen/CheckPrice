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
    { query: 'has:attachment subject:"Update Harga" is:unread', folder: "PQ" },
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

        for (const attachment of message.getAttachments()) {
          const fileName = attachment.getName();

          if (!isAllowedFile(fileName)) {
            Logger.log("  Skip: " + fileName);
            continue;
          }

          Logger.log("  Memproses: " + fileName + " -> " + rule.folder);

          const publicUrl = uploadToSupabase(attachment, fileName, rule.folder);

          if (!publicUrl) {
            Logger.log("  GAGAL upload: " + fileName);
            continue;
          }

          Logger.log("  Tersimpan: " + publicUrl);
          totalUploaded++;
          triggerPythonEngine(publicUrl, fileName, rule.folder);
        }

        thread.markRead();
      }
    }
  }

  Logger.log("Selesai. Total upload: " + totalUploaded);
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

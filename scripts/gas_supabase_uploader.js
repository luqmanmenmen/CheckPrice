/**
 * ============================================================
 *  GOOGLE APPS SCRIPT — KHUSUS PROMO EMAIL → SUPABASE & VERCEL
 * ============================================================
 *  Pembaruan Arsitektur:
 *  1. File POWER QUERY DIHENTIKAN total (tidak dicari lagi).
 *  2. Hanya mencari email lampiran bertema "Promo".
 *  3. Railway DILEPAS total. GAS langsung mengirim instruksi ke
 *     Vercel (https://luqmanganteng.my.id).
 *  4. Data promo HANYA memperbarui harga diskon/promo,
 *     TIDAK menyentuh stok fisik dan barcode dari MDS BISA.
 * ============================================================
 */

const CONFIG = {
  // --- Supabase Storage ---
  SUPABASE_URL:         "https://lzynugpistiyhxqkgwmk.supabase.co",
  SUPABASE_SERVICE_KEY: PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_KEY") || "BELUM_DISET",
  BUCKET_NAME:          "excel-uploads",

  // --- Production Vercel URL (Menggantikan Railway) ---
  APP_URL: "https://luqmanganteng.my.id",

  // --- Filter Gmail (Khusus Promo Saja) ---
  GMAIL_QUERIES: [
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
      Logger.log("  Tidak ada email promo baru.");
      continue;
    }

    for (const thread of threads) {
      for (const message of thread.getMessages()) {
        if (!message.isUnread()) continue;
        
        const subject = message.getSubject();
        const safeSubject = subject.replace(/[^a-zA-Z0-9 -_]/g, "").trim();

        // 1. Kumpulkan lampiran promo yang valid
        const attachments = message.getAttachments().filter(att => isAllowedFile(att.getName()));

        if (attachments.length === 0) {
          Logger.log("  Tidak ada lampiran valid di email ini.");
          continue;
        }

        // 2. Upload dan proses
        for (const attachment of attachments) {
          const fileName = attachment.getName();
          const dynamicFolder = rule.folder + "/" + safeSubject;

          Logger.log("  Memproses promo: " + fileName + " -> " + dynamicFolder);

          const publicUrl = uploadToSupabase(attachment, fileName, dynamicFolder);

          if (!publicUrl) {
            Logger.log("  GAGAL upload: " + fileName);
            continue;
          }

          Logger.log("  Tersimpan di Storage: " + publicUrl);
          totalUploaded++;
          
          // Kirim ke Vercel Engine untuk update harga promo
          triggerVercelPromoEngine(publicUrl, fileName);
        }

        thread.markRead();
      }
    }
  }

  Logger.log("Selesai. Total promo di-upload: " + totalUploaded);
}

function uploadToSupabase(attachment, fileName, folder) {
  try {
    const blob        = attachment.copyBlob();
    const filePath    = folder + "/" + fileName;
    const uploadUrl   = CONFIG.SUPABASE_URL + "/storage/v1/object/" + CONFIG.BUCKET_NAME + "/" + encodeURIComponent(filePath);

    const options = {
      method:             "post",
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

function triggerVercelPromoEngine(publicUrl, fileName) {
  if (!CONFIG.APP_URL) {
    Logger.log("  [SKIP] URL Vercel belum diisi.");
    return;
  }

  try {
    const payload = JSON.stringify({
      type: "UPDATE_PROMO",
      explicitUrl: publicUrl,
      explicitFileName: fileName,
    });

    const options = {
      method:             "post",
      headers: {
        "Content-Type": "application/json",
      },
      payload:            payload,
      muteHttpExceptions: true,
    };

    const syncUrl = CONFIG.APP_URL + "/api/upload/sync-latest-blob";
    const response     = UrlFetchApp.fetch(syncUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    Logger.log("  Vercel Engine [" + responseCode + "]: " + responseBody.substring(0, 300));

  } catch (e) {
    Logger.log("  Vercel Engine Error: " + e.message);
  }
}

function isAllowedFile(fileName) {
  const lower = fileName.toLowerCase();
  return CONFIG.ALLOWED_EXTENSIONS.some(function(ext) { return lower.endsWith(ext); });
}

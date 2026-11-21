/**
 * ============================================================
 *  GOOGLE APPS SCRIPT — 100% TURSO CLOUD & VERCEL (0% SUPABASE)
 * ============================================================
 *  Alur Baru (Bebas Supabase 100%):
 *  1. Mencari email masuk bertema "Promo" yang memiliki lampiran Excel/CSV.
 *  2. Mengunggah langsung file lampiran ke Vercel Webhook:
 *     `https://luqmanganteng.my.id/api/webhook/gmail`
 *  3. Jika 1 email berisi banyak lampiran Excel, lampiran 1..(N-1) diunggah
 *     lebih dulu lalu lampiran terakhir otomatis memicu 1x update serentak
 *     ke GitHub Actions + Turso Cloud (`Product` + `CatalogArticle` + Snapshot + Analytics)!
 *  4. Semua user yang sedang login langsung melihat Loader Progres Update Promo real-time!
 * ============================================================
 */

const CONFIG = {
  // --- Production Vercel URL ---
  APP_URL: "https://luqmanganteng.my.id",

  // --- Token Keamanan Webhook (sama dengan WEBHOOK_SECRET di Vercel) ---
  WEBHOOK_TOKEN:
    PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET") ||
    "B4mb4ng123!Aman",

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

        const attachments = message
          .getAttachments()
          .filter((att) => isAllowedFile(att.getName()));

        if (attachments.length === 0) {
          Logger.log("  Tidak ada lampiran valid di email ini.");
          continue;
        }

        const totalAtt = attachments.length;
        for (let idx = 0; idx < totalAtt; idx++) {
          const attachment = attachments[idx];
          const fileName = attachment.getName();
          const dynamicFolder = rule.folder + "/" + safeSubject;
          const isLast = idx === totalAtt - 1;

          Logger.log(
            "  Mengirim promo [" + (idx + 1) + "/" + totalAtt + "] ke Turso: " +
              fileName + " -> " + dynamicFolder
          );
          const ok = uploadPromoDirectlyToVercelTurso(
            attachment,
            fileName,
            dynamicFolder,
            !isLast,
            totalAtt > 1 && isLast
          );
          if (ok) {
            totalUploaded++;
          }
        }

        thread.markRead();
      }
    }
  }

  Logger.log("Selesai. Total promo terkirim ke Turso Cloud: " + totalUploaded);
}

function uploadPromoDirectlyToVercelTurso(attachment, fileName, folder, skipTrigger, triggerFolder) {
  try {
    const webhookUrl = CONFIG.APP_URL + "/api/webhook/gmail";
    const blob = attachment.copyBlob().setName(fileName);

    const options = {
      method: "post",
      payload: {
        token: CONFIG.WEBHOOK_TOKEN,
        folder: folder,
        fileName: fileName,
        skipTrigger: skipTrigger ? "1" : "0",
        triggerFolder: triggerFolder ? "1" : "0",
        file: blob,
      },
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(webhookUrl, options);
    const code = response.getResponseCode();
    const body = response.getContentText();
    Logger.log("  Vercel->Turso [" + code + "]: " + body.substring(0, 300));
    return code === 200 || code === 201;
  } catch (e) {
    Logger.log("  Upload Error: " + e.message);
    return false;
  }
}

function isAllowedFile(fileName) {
  const lower = fileName.toLowerCase();
  return CONFIG.ALLOWED_EXTENSIONS.some(function (ext) {
    return lower.endsWith(ext);
  });
}

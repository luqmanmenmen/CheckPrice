/**
 * wa-cs-bridge/index.mjs
 * =============================================================================
 * Bridge WhatsApp Ringan (Baileys) -> Python AI CS Engine (www.luqmanganteng.my.id)
 *
 * SOP Layanan VIP Halo BCA (Anti-Ganggu Grup!):
 *   1. Customer menyapa ("halo", "permisi") atau tanya produk di GRUP:
 *      - Di GRUP: bot langsung quote pesan customer dengan balasan singkat sopan
 *        ("Akan saya bantu Kak, saya teruskan melalui private chat ya agar tidak
 *         mengganggu member lain di grup ini 🙏").
 *      - BERSAMAAN di PRIVATE CHAT customer tsb: bot kirim seluruh kartu Foto HD
 *        + harga, promo, warna & ukuran yang ready (tanpa angka stok!).
 *   2. Sesi Private Chat VIP (30 menit):
 *      - Customer yang baru di-japri dari grup bisa langsung lanjut tanya-tanya di
 *        Private Chat selama 30 menit!
 *      - Chat pribadi teman/keluarga yang TIDAK berasal dari sesi grup tetap
 *        100% DIBLOKIR DI PC (tidak pernah dibaca atau dikirim ke server!).
 *   3. Human Takeover otomatis (10 menit): jika PIC balas manual di grup atau PC
 *      customer, bot otomatis minggir diam 10 menit.
 * =============================================================================
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

const API_URL = (
  process.env.WA_CS_API_URL || "https://www.luqmanganteng.my.id/api/py_wa_cs"
).trim();
const PROMO_WEBHOOK_URL = (
  process.env.WA_PROMO_WEBHOOK_URL ||
  API_URL.replace(/\/api\/py_wa_cs\/?$/, "/api/webhook/wa-promo")
).trim();
const API_SECRET = (
  process.env.WA_CS_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "B4mb4ng123!Aman"
).trim();
const DEFAULT_ADMIN_PHONE = (process.env.WA_ADMIN_PHONE || "6281296393972")
  .replace(/[^0-9]/g, "")
  .replace(/^0/, "62");
const CLI_PAIR_MODE =
  process.argv.includes("--pair") || process.env.WA_USE_PAIRING === "1";

const AUTH_DIR = path.resolve(process.env.WA_AUTH_DIR || "./auth_info");
const HEALTH_PORT = Number(process.env.PORT || process.env.WA_BRIDGE_HEALTH_PORT || 0);
const BRIDGE_VERSION = "v2.2-promo719-fullauth";
const logger = pino({ level: "silent" });
const startUnixSec = Math.floor(Date.now() / 1000);

// Proteksi anti-crash saat koneksi WhatsApp drop sementara (Baileys 428 Connection Closed / Bad MAC)
process.on("unhandledRejection", (reason) => {
  const msg = String(reason?.message || reason || "");
  if (msg.includes("Connection Closed") || msg.includes("Bad MAC") || reason?.output?.statusCode === 428) {
    console.log("⚠️ [AUTO-RECOVER] Abaikan error koneksi transien Baileys:", msg.slice(0, 80));
    return;
  }
  console.error("⚠️ [UNHANDLED REJECTION]", msg.slice(0, 140));
});
process.on("uncaughtException", (err) => {
  const msg = String(err?.message || err || "");
  console.error("⚠️ [UNCAUGHT EXCEPTION]", msg.slice(0, 140));
});

const botSentIds = new Set();
// Jeda Human Takeover per chat (groupJid atau dmJid) -> timestamp ms
const humanTakeoverUntil = new Map();
// Buffer penggabung chat pendek beruntun (anti-spam bubble: "P" + "mau tanya celana" + "tapi bukan chino"!)
// key = `${jid}::${sender}` -> { texts: [], quotedText, lastMsg, senderName, isGroup, groupName, dmInfo, timer }
const pendingMessageBuffers = new Map();
const DEBOUNCE_WINDOW_MS = 2600;
// Sesi Private Chat VIP aktif (hanya untuk customer yang baru di-handoff dari grup!)
// key (jid / phone digits) -> expiresAtMs
const activeDmSessions = new Map();
// Cache metadata grup: groupId -> { name, participants, fetchedAt }
const groupMetaCache = new Map();

// ─── ANTREAN AUTO-UPDATE PROMO EXCEL VIA KODE RAHASIA WHATSAPP ───────────────
// Kode rahasia:
//   - "update promo 719"    -> DIRECT langsung update promo hari itu juga ke harga kasir
//   - "update promo 719 h-" -> AFTER PROMO / H- (Persiapan POP /promo-mendatang, read-only DB kasir)
const pendingPromoDocs = new Map();    // jid -> Array<{ msg, docInfo, receivedAt }>
const recentDocByMsgId = new Map();    // msgId -> { msg, docInfo, jid, receivedAt }
const armedPromoSessions = new Map();  // jid -> { cmd, expiresAt, timer, files, lastMsg }
const PROMO_DOC_TTL_MS = 15 * 60 * 1000;
const PROMO_ARMED_TTL_MS = 5 * 60 * 1000;
const PROMO_BATCH_DEBOUNCE_MS = 3500;
const EXCEL_EXT_RE = /\.(xlsx|xls|csv|xlsm|xlsb)$/i;

let currentSock = null;
let isConnected = false;
let currentPhone = DEFAULT_ADMIN_PHONE;
let currentHumanTakeoverMins = 10;
let currentIgnorePrivateChats = false;
let lastHandledPairingReq = 0;
let lastHandledLogoutReq = 0;
let pendingWebPairingPhone = "";
let isRestarting = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHumanDelayMs() {
  return 1800 + Math.floor(Math.random() * 1200);
}

function normalizePhone(raw) {
  const digits = String(raw || "").split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

function markDmSessionActive(jidsOrPhones, minutes = 30) {
  const expiresAt = Date.now() + Math.max(5, Number(minutes) || 30) * 60 * 1000;
  for (const item of jidsOrPhones) {
    const raw = String(item || "").trim();
    if (!raw) continue;
    activeDmSessions.set(raw.toLowerCase(), expiresAt);
    const digits = normalizePhone(raw);
    if (digits && digits.length >= 9) {
      activeDmSessions.set(digits, expiresAt);
    }
  }
}

function isDmSessionActive(jid, altJid = "") {
  const now = Date.now();
  const candidates = [
    String(jid || "").toLowerCase(),
    String(altJid || "").toLowerCase(),
    normalizePhone(jid),
    normalizePhone(altJid),
  ].filter(Boolean);
  for (const key of candidates) {
    const exp = activeDmSessions.get(key) || 0;
    if (exp > now) return true;
  }
  return false;
}

function clearAuthDir() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch {}
}

function unwrapMessageContent(m) {
  let cur = m;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur.ephemeralMessage?.message) {
      cur = cur.ephemeralMessage.message;
    } else if (cur.viewOnceMessage?.message) {
      cur = cur.viewOnceMessage.message;
    } else if (cur.viewOnceMessageV2?.message) {
      cur = cur.viewOnceMessageV2.message;
    } else if (cur.viewOnceMessageV2Extension?.message) {
      cur = cur.viewOnceMessageV2Extension.message;
    } else if (cur.documentWithCaptionMessage?.message) {
      cur = cur.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }
  return cur;
}

function extractMessageText(msg) {
  const m = unwrapMessageContent(msg?.message);
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  return "";
}

function extractExcelDocument(msg) {
  const m = unwrapMessageContent(msg?.message);
  const doc = m?.documentMessage;
  if (!doc) return null;
  const fileName = String(doc.fileName || doc.title || "").trim();
  const mimetype = String(doc.mimetype || "").toLowerCase();
  const isExcelExt = EXCEL_EXT_RE.test(fileName);
  const isExcelMime =
    mimetype.includes("spreadsheetml") ||
    mimetype.includes("ms-excel") ||
    mimetype.includes("excel") ||
    mimetype.includes("text/csv") ||
    mimetype.includes("comma-separated-values");
  if (!isExcelExt && !isExcelMime) return null;
  const fallbackName = fileName || `promo_wa_${Date.now()}.${mimetype.includes("csv") ? "csv" : "xlsx"}`;
  return {
    docMsg: doc,
    fileName: fallbackName,
    mimetype: mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileLength: Number(doc.fileLength || 0),
    caption: String(doc.caption || "").trim(),
  };
}

function extractQuotedStanzaId(msg) {
  const m = unwrapMessageContent(msg?.message);
  if (!m) return "";
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    null;
  return String(ctx?.stanzaId || "").trim();
}

function parsePromoSecretCommand(rawText) {
  const normalized = String(rawText || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (!/\bupdate\s+promo\s+719\b/i.test(normalized)) return null;
  const hasHMinus = /\bupdate\s+promo\s+719\s+h\s*-/i.test(normalized);
  return {
    mode: hasHMinus ? "upcoming" : "direct",
    modeLabel: hasHMinus
      ? "🏷️ AFTER PROMO / H- (Persiapan POP — Promo kasir hari ini tetap aman)"
      : "🔥 DIRECT LANGSUNG (Update Promo Hari Ini ke Harga Kasir)",
    raw: String(rawText || "").trim(),
  };
}

function formatWibFolderStamp() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const iso = wib.toISOString();
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 19).replace(/:/g, "");
  return `${datePart}_${timePart}`;
}

function queuePendingPromoDoc(jid, msg, docInfo) {
  const now = Date.now();
  const existing = (pendingPromoDocs.get(jid) || []).filter(
    (item) => now - item.receivedAt < PROMO_DOC_TTL_MS
  );
  const msgId = msg?.key?.id || "";
  if (!msgId || !existing.some((x) => x.msg?.key?.id === msgId)) {
    existing.push({ msg, docInfo, receivedAt: now });
  }
  pendingPromoDocs.set(jid, existing.slice(-12));

  if (msgId) {
    recentDocByMsgId.set(msgId, { msg, docInfo, jid, receivedAt: now });
    if (recentDocByMsgId.size > 60) {
      const oldestKey = recentDocByMsgId.keys().next().value;
      recentDocByMsgId.delete(oldestKey);
    }
  }
  return existing.length;
}

async function executeWaPromoBatch(sock, jid, cmd, docEntries, quoteMsg = null) {
  const validEntries = (docEntries || []).filter((e) => e?.msg && e?.docInfo);
  if (validEntries.length === 0) return;

  const stamp = formatWibFolderStamp();
  const folder = cmd.mode === "upcoming" ? `UPCOMING_WA_${stamp}` : `WA_DIRECT_${stamp}`;
  const fileNamesPreview = validEntries.map((e, idx) => `${idx + 1}. ${e.docInfo.fileName}`).join("\n");

  console.log(
    `🏷️ [WA PROMO AUTO-UPDATE] Mode=${cmd.mode.toUpperCase()} | Folder=${folder} | Files=${validEntries.length}`
  );

  const startReply = await sock
    .sendMessage(
      jid,
      {
        text:
          `⏳ *Kode rahasia terverifikasi!*\n` +
          `• Mode: *${cmd.modeLabel}*\n` +
          `• Jumlah File: *${validEntries.length} file Excel*\n` +
          `${fileNamesPreview}\n\n` +
          `Sedang mengunduh & mengunggah ke server Turso + menyalakan mesin Python...`,
      },
      quoteMsg ? { quoted: quoteMsg } : {}
    )
    .catch(() => null);
  trackBotSent(startReply);

  const uploaded = [];
  const failed = [];

  for (const entry of validEntries) {
    const fname = entry.docInfo.fileName;
    try {
      const buf = await downloadMediaMessage(
        entry.msg,
        "buffer",
        {},
        { logger, reuploadRequest: sock.updateMediaMessage }
      );
      if (!buf || buf.length === 0) {
        failed.push(`${fname} (file kosong)`);
        continue;
      }

      const form = new FormData();
      form.append(
        "file",
        new Blob([buf], { type: entry.docInfo.mimetype }),
        fname
      );
      form.append("folder", folder);
      form.append("fileName", fname);

      const upRes = await fetch(PROMO_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "X-WA-CS-Secret": API_SECRET,
        },
        body: form,
        signal: AbortSignal.timeout(45000),
      });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !upJson?.success) {
        failed.push(`${fname} (${upJson?.error || `HTTP ${upRes.status}`})`);
        continue;
      }
      uploaded.push({
        fileName: upJson.fileName || fname,
        sizeKb: Math.max(1, Math.round((upJson.sizeBytes || buf.length) / 1024)),
      });
    } catch (err) {
      failed.push(`${fname} (${err?.message || "gagal unduh/upload"})`);
    }
  }

  if (uploaded.length === 0) {
    const failSent = await sock
      .sendMessage(
        jid,
        {
          text:
            `❌ *Gagal mengunggah file promo ke server!*\n` +
            `Detail:\n${failed.map((f) => `• ${f}`).join("\n")}\n\n` +
            `Coba teruskan ulang file Excel-nya ya.`,
        },
        quoteMsg ? { quoted: quoteMsg } : {}
      )
      .catch(() => null);
    trackBotSent(failSent);
    return;
  }

  // Trigger 1x GitHub Actions Python Runner untuk seluruh batch folder ini!
  let dispatchOk = false;
  let dispatchErr = "";
  try {
    const dRes = await fetch(PROMO_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WA-CS-Secret": API_SECRET,
      },
      body: JSON.stringify({
        promoMode: cmd.mode,
        folder,
        fileCount: uploaded.length,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const dJson = await dRes.json().catch(() => ({}));
    if (dRes.ok && dJson?.success) {
      dispatchOk = true;
    } else {
      dispatchErr = dJson?.error || `HTTP ${dRes.status}`;
    }
  } catch (err) {
    dispatchErr = err?.message || "timeout dispatch";
  }

  const targetPageUrl =
    cmd.mode === "upcoming"
      ? "https://www.luqmanganteng.my.id/promo-mendatang"
      : "https://www.luqmanganteng.my.id/super-admin/sinkronisasi-harian";

  const fileSummary = uploaded
    .map((u, idx) => `${idx + 1}. ${u.fileName} (${u.sizeKb} KB)`)
    .join("\n");
  const warnPart = failed.length > 0 ? `\n⚠️ Gagal upload:\n${failed.map((f) => `• ${f}`).join("\n")}\n` : "";

  const finalText = dispatchOk
    ? `✅ *UPDATE PROMO OTOMATIS BERHASIL DINYALAKAN!*\n\n` +
      `• Mode: *${cmd.modeLabel}*\n` +
      `• Folder Cloud: \`PROMO/${folder}\`\n` +
      `• File Terunggah (${uploaded.length}):\n${fileSummary}\n` +
      `${warnPart}\n` +
      `🚀 Mesin Python GitHub Actions sedang memproses promo otomatis (±30–60 detik).\n` +
      `🔗 Pantau hasil: ${targetPageUrl}`
    : `⚠️ *File sudah masuk Turso Storage, tapi trigger mesin gagal.*\n` +
      `• Folder: \`PROMO/${folder}\`\n` +
      `• File (${uploaded.length}):\n${fileSummary}\n` +
      `• Error: ${dispatchErr}\n` +
      `Bisa klik manual di ${targetPageUrl}`;

  const doneSent = await sock
    .sendMessage(jid, { text: finalText }, quoteMsg ? { quoted: quoteMsg } : {})
    .catch(() => null);
  trackBotSent(doneSent);
  console.log(
    `   ${dispatchOk ? "✅" : "⚠️"} [WA PROMO] Selesai (${uploaded.length} file, dispatch=${dispatchOk ? "OK" : dispatchErr})`
  );
}

/**
 * Handler khusus Auto-Update Promo Excel di Private Chat nomor 085771123000.
 * Mendukung 4 skenario alami WA:
 *   1. Kirim file Excel dengan caption "update promo 719" / "update promo 719 h-"
 *   2. Forward 1 atau banyak file Excel dulu -> lalu ketik "update promo 719" / "update promo 719 h-"
 *   3. Ketik "update promo 719" / "update promo 719 h-" dulu -> lalu forward 1 atau banyak file Excel
 *   4. Reply pesan file Excel sebelumnya dengan "update promo 719" / "update promo 719 h-"
 * Mengembalikan `true` jika pesan sudah ditangani (tidak boleh masuk AI CS!).
 */
async function handleWaPromoExcelFlow(sock, msg, jid, text, isGroup) {
  if (isGroup) return false;

  const fromMe = Boolean(msg?.key?.fromMe);
  const altRemote = String(msg?.key?.remoteJidAlt || "");
  const jidPhone = normalizePhone(altRemote || jid);
  const isSelfChat = Boolean(jidPhone && currentPhone && jidPhone === currentPhone);
  const sessionKey = jidPhone || jid.toLowerCase();

  const docInfo = extractExcelDocument(msg);
  const cmd = parsePromoSecretCommand(text);

  // A. PESAN MEMBAWA FILE EXCEL (.xlsx / .xls / .csv)
  if (docInfo) {
    // Jika 085771123000 mengirim Excel ke nomor orang lain tanpa kode rahasia, abaikan agar tidak ikut antre
    if (fromMe && !isSelfChat && !cmd) return false;

    const now = Date.now();
    const armed = armedPromoSessions.get(sessionKey);
    const activeCmd = cmd || (armed && armed.expiresAt > now ? armed.cmd : null);

    // Jika ada kode rahasia di caption ATAU sesi armed sedang aktif -> kumpulkan batch (debounce 3,5 dtk) lalu proses!
    if (activeCmd) {
      if (armed?.timer) clearTimeout(armed.timer);
      const files = armed && armed.expiresAt > now ? armed.files : [];
      files.push({ msg, docInfo, receivedAt: now });
      const entry = {
        cmd: activeCmd,
        expiresAt: now + PROMO_ARMED_TTL_MS,
        files,
        lastMsg: msg,
        timer: null,
      };
      entry.timer = setTimeout(async () => {
        armedPromoSessions.delete(sessionKey);
        pendingPromoDocs.delete(sessionKey);
        await executeWaPromoBatch(sock, jid, entry.cmd, entry.files, entry.lastMsg);
      }, PROMO_BATCH_DEBOUNCE_MS);
      armedPromoSessions.set(sessionKey, entry);
      console.log(
        `📥 [WA PROMO] File Excel "${docInfo.fileName}" masuk (${files.length} file dalam batch ${activeCmd.mode.toUpperCase()})...`
      );
      return true;
    }

    // Tidak ada kode rahasia -> simpan diam-diam di antrean (TTL 15 menit), JANGAN update DB & JANGAN masuk AI CS!
    const count = queuePendingPromoDoc(sessionKey, msg, docInfo);
    console.log(
      `📎 [WA PROMO QUEUE] File Excel "${docInfo.fileName}" ditampung (${count} file antre dari ${sessionKey} — menunggu kode rahasia).`
    );
    return true;
  }

  // B. PESAN TEKS BERISI KODE RAHASIA ("update promo 719" atau "update promo 719 h-")
  if (cmd) {
    const now = Date.now();
    const quotedId = extractQuotedStanzaId(msg);
    const queued = (pendingPromoDocs.get(sessionKey) || []).filter(
      (item) => now - item.receivedAt < PROMO_DOC_TTL_MS
    );

    // Prioritas 1: jika user me-reply file Excel spesifik & antrean baru kosong, proses file yang di-reply!
    let targetEntries = queued;
    if (quotedId && recentDocByMsgId.has(quotedId)) {
      const quotedDoc = recentDocByMsgId.get(quotedId);
      if (targetEntries.length === 0) {
        targetEntries = [quotedDoc];
      } else if (!targetEntries.some((x) => x.msg?.key?.id === quotedId)) {
        targetEntries = [quotedDoc, ...targetEntries];
      }
    }

    if (targetEntries.length > 0) {
      pendingPromoDocs.delete(sessionKey);
      const existingArmed = armedPromoSessions.get(sessionKey);
      if (existingArmed?.timer) clearTimeout(existingArmed.timer);
      armedPromoSessions.delete(sessionKey);
      await executeWaPromoBatch(sock, jid, cmd, targetEntries, msg);
      return true;
    }

    // Belum ada file Excel yang antre -> aktifkan sesi armed 5 menit & minta user teruskan file Excel-nya!
    const prevArmed = armedPromoSessions.get(sessionKey);
    if (prevArmed?.timer) clearTimeout(prevArmed.timer);
    armedPromoSessions.set(sessionKey, {
      cmd,
      expiresAt: now + PROMO_ARMED_TTL_MS,
      files: [],
      lastMsg: msg,
      timer: null,
    });
    const armedSent = await sock
      .sendMessage(
        jid,
        {
          text:
            `🔐 *Kode rahasia aktif (berlaku 5 menit)!*\n` +
            `• Mode: *${cmd.modeLabel}*\n\n` +
            `Silakan teruskan/kirim file Excel promonya sekarang (bisa 1 atau beberapa file sekaligus), nanti saya proses otomatis begitu masuk 🚀`,
        },
        { quoted: msg }
      )
      .catch(() => null);
    trackBotSent(armedSent);
    console.log(`🔐 [WA PROMO ARMED] Menunggu file Excel dari ${sessionKey} (Mode: ${cmd.mode.toUpperCase()})`);
    return true;
  }

  return false;
}

/**
 * Ekstrak teks/caption dari pesan promo atau foto yang di-REPLY (di-quote) oleh customer!
 * Krusial di lapangan: customer sering reply postingan promo lalu cuma ketik "Mau navy S kak" / "foto warna lainnya?".
 */
function extractQuotedText(msg) {
  const m = msg?.message;
  if (!m) return "";
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
    null;
  const qm = ctx?.quotedMessage;
  if (!qm) return "";
  return extractMessageText({ message: qm }).trim().slice(0, 600);
}

function isEmergencyCommand(text) {
  const low = String(text || "").trim().toLowerCase();
  return [
    "!csoff",
    "/csoff",
    "!cs off",
    "!matikan cs",
    "!cson",
    "/cson",
    "!cs on",
    "!aktifkan cs",
    "!csstatus",
    "/csstatus",
    "!cs status",
  ].includes(low);
}

async function getGroupInfo(sock, groupJid) {
  const cached = groupMetaCache.get(groupJid);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
    return cached;
  }
  try {
    const meta = await sock.groupMetadata(groupJid);
    const info = {
      name: meta?.subject || groupJid,
      participants: Array.isArray(meta?.participants) ? meta.participants : [],
      fetchedAt: Date.now(),
    };
    groupMetaCache.set(groupJid, info);
    return info;
  } catch {
    return { name: groupJid, participants: [], fetchedAt: Date.now() };
  }
}

/**
 * Resolve JID Private Chat terbaik untuk anggota grup (mendukung format @s.whatsapp.net maupun @lid baru!)
 */
async function resolveParticipantDmJid(sock, groupJid, msg) {
  const rawPart = String(msg.key?.participant || "").trim();
  const altPart = String(msg.key?.participantAlt || "").trim();

  if (altPart && altPart.endsWith("@s.whatsapp.net")) {
    return { dmJid: altPart, allKeys: [altPart, rawPart] };
  }
  if (rawPart && rawPart.endsWith("@s.whatsapp.net")) {
    return { dmJid: rawPart, allKeys: [rawPart, altPart] };
  }

  // Jika participant berbentuk @lid, cari phoneNumber / jid asli di metadata grup
  if (rawPart && groupJid.endsWith("@g.us")) {
    const info = await getGroupInfo(sock, groupJid);
    for (const p of info.participants) {
      const pid = String(p?.id || "");
      const plid = String(p?.lid || "");
      const pphone = String(p?.phoneNumber || "");
      if (pid === rawPart || plid === rawPart) {
        if (pphone && pphone.endsWith("@s.whatsapp.net")) {
          return { dmJid: pphone, allKeys: [pphone, rawPart, pid, plid] };
        }
        if (pid && pid.endsWith("@s.whatsapp.net")) {
          return { dmJid: pid, allKeys: [pid, rawPart, plid] };
        }
      }
    }
  }

  return { dmJid: rawPart || altPart, allKeys: [rawPart, altPart] };
}

const JUNK_IMG_SIZES = new Set([2238, 3163]);

async function fetchImageBuffer(imageUrl, fallbackUrls = []) {
  const candidates = [imageUrl, ...(Array.isArray(fallbackUrls) ? fallbackUrls : [])]
    .map((u) => String(u || "").trim())
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

  for (const url of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) continue;
        const ctype = String(res.headers.get("content-type") || "").toLowerCase();
        if (ctype && !ctype.includes("image") && !ctype.includes("octet-stream")) continue;
        const arr = await res.arrayBuffer();
        // Tolak file kosong & sidik jari logo Matahari abu-abu (2238 / 3163 bytes)
        if (arr.byteLength < 3500 || JUNK_IMG_SIZES.has(arr.byteLength)) continue;
        return Buffer.from(arr);
      } catch (err) {
        if (attempt === 2) {
          console.log(`   ⚠️ Gagal unduh foto (${url.slice(-36)}): ${err?.message || err}`);
        } else {
          await sleep(450);
        }
      }
    }
  }
  return null;
}

async function callPythonWaCs(payload, timeoutMs = 30000) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-WA-CS-Secret": API_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, shouldReply: false, reason: `HTTP_${res.status}` };
  }
}

function trackBotSent(sent) {
  if (sent?.key?.id) {
    botSentIds.add(sent.key.id);
    if (botSentIds.size > 400) {
      const first = botSentIds.values().next().value;
      botSentIds.delete(first);
    }
  }
}

async function sendCardsToJid(sock, targetJid, cards, quoteMsg = null) {
  await sock.sendPresenceUpdate("composing", targetJid).catch(() => {});
  const [imgBuffers] = await Promise.all([
    Promise.all(
      cards.map((card) =>
        card.imageUrl
          ? fetchImageBuffer(card.imageUrl, card.fallbackImages || [])
          : Promise.resolve(null)
      )
    ),
    sleep(randomHumanDelayMs()),
  ]);

  let sentPhotos = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const imgBuffer = imgBuffers[i];
    const captionText = String(card.text || "").trim();
    if (!captionText && !imgBuffer) continue;

    const sendOpts = i === 0 && quoteMsg ? { quoted: quoteMsg } : {};
    let sent;
    if (imgBuffer) {
      sentPhotos++;
      sent = await sock.sendMessage(
        targetJid,
        { image: imgBuffer, caption: captionText },
        sendOpts
      );
    } else if (card.imageUrl) {
      // Fallback: biarkan Baileys mengunduh URL langsung jika fetch Node sempat hiccup
      try {
        sent = await sock.sendMessage(
          targetJid,
          { image: { url: card.imageUrl }, caption: captionText },
          sendOpts
        );
        sentPhotos++;
      } catch {
        sent = await sock.sendMessage(targetJid, { text: captionText }, sendOpts);
      }
    } else {
      sent = await sock.sendMessage(
        targetJid,
        { text: captionText },
        sendOpts
      );
    }
    trackBotSent(sent);

    if (i < cards.length - 1) {
      await sleep(1050);
    }
  }
  await sock.sendPresenceUpdate("paused", targetJid).catch(() => {});
  return sentPhotos;
}

async function syncBridgeState(extra = {}) {
  try {
    let authFileCount = 0;
    try {
      if (fs.existsSync(AUTH_DIR)) {
        authFileCount = fs.readdirSync(AUTH_DIR).filter((f) => f.endsWith(".json")).length;
      }
    } catch {}
    const res = await callPythonWaCs(
      {
        action: "bridge-sync",
        connected: isConnected,
        phone: currentPhone,
        bridgeVersion: BRIDGE_VERSION,
        authFileCount,
        ...extra,
      },
      8000
    );
    if (!res?.success) return null;
    if (res.adminPhone) currentPhone = normalizePhone(res.adminPhone) || currentPhone;
    if (typeof res.humanTakeoverMinutes === "number") {
      currentHumanTakeoverMins = res.humanTakeoverMinutes;
    }
    if (typeof res.ignorePrivateChats === "boolean") {
      currentIgnorePrivateChats = res.ignorePrivateChats;
    }
    return res.bridge || null;
  } catch {
    return null;
  }
}

async function restartSocket(cleanAuth = false, requestPairingForPhone = "") {
  if (isRestarting) return;
  isRestarting = true;
  try {
    if (currentSock) {
      try {
        currentSock.ev.removeAllListeners("connection.update");
        currentSock.ev.removeAllListeners("messages.upsert");
        currentSock.end(undefined);
      } catch {}
      currentSock = null;
    }
    isConnected = false;
    if (cleanAuth) {
      clearAuthDir();
      await clearCloudAuthBackup();
    }
    pendingWebPairingPhone = requestPairingForPhone;
    await sleep(600);
  } finally {
    isRestarting = false;
  }
  startSocket();
}

let lastCloudAuthSignature = "";
let cloudAuthBackupTimer = null;
let skipNextCloudRestore = false;

function readAuthFolderBundle() {
  if (!fs.existsSync(AUTH_DIR)) return null;
  const credsPath = path.join(AUTH_DIR, "creds.json");
  if (!fs.existsSync(credsPath)) return null;
  const creds = fs.readFileSync(credsPath, "utf-8");
  if (!creds || !creds.includes('"registered":true')) return null;

  const files = {};
  let totalBytes = 0;
  const entries = fs.readdirSync(AUTH_DIR).filter((f) => f.endsWith(".json")).sort();
  for (const fname of entries) {
    if (Object.keys(files).length >= 280) break;
    try {
      const full = path.join(AUTH_DIR, fname);
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 110_000) continue;
      if (totalBytes + stat.size > 1_100_000) continue;
      const content = fs.readFileSync(full, "utf-8");
      files[fname] = content;
      totalBytes += stat.size;
    } catch {}
  }
  const signature = JSON.stringify(files);
  return { creds, files, fileCount: Object.keys(files).length, signature };
}

async function restoreAuthFromCloudIfMissing() {
  if (skipNextCloudRestore) {
    skipNextCloudRestore = false;
    return false;
  }
  const credsPath = path.join(AUTH_DIR, "creds.json");
  if (fs.existsSync(credsPath)) return false;
  try {
    const res = await callPythonWaCs({ action: "bridge-auth-get" }, 12000);
    const hasFiles = res?.files && typeof res.files === "object" && Object.keys(res.files).length > 0;
    const hasCreds = typeof res?.creds === "string" && res.creds.trim().startsWith("{");
    if (res?.success && (hasFiles || hasCreds)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      let restoredCount = 0;
      if (hasFiles) {
        for (const [fname, content] of Object.entries(res.files)) {
          const safe = path.basename(String(fname || ""));
          if (!safe || !safe.endsWith(".json") || typeof content !== "string") continue;
          fs.writeFileSync(path.join(AUTH_DIR, safe), content, "utf-8");
          restoredCount++;
        }
      }
      if (hasCreds && !fs.existsSync(credsPath)) {
        fs.writeFileSync(credsPath, res.creds, "utf-8");
        restoredCount++;
      }
      const bundle = readAuthFolderBundle();
      if (bundle) lastCloudAuthSignature = bundle.signature;
      console.log(`☁️ [CLOUD AUTH] Pulih otomatis ${restoredCount} file Signal/WA dari Turso Cloud!`);
      return restoredCount > 0;
    }
  } catch (err) {
    console.log("⚠️ [CLOUD AUTH] Gagal pull sesi dari cloud:", err?.message || err);
  }
  return false;
}

async function backupAuthBundleNow(timeoutMs = 12000) {
  try {
    const bundle = readAuthFolderBundle();
    if (!bundle || bundle.signature === lastCloudAuthSignature) return false;
    const res = await callPythonWaCs(
      { action: "bridge-auth-save", creds: bundle.creds, files: bundle.files },
      timeoutMs
    );
    if (res?.success) {
      lastCloudAuthSignature = bundle.signature;
      console.log(`☁️ [CLOUD AUTH] Backup penuh (${bundle.fileCount} file Signal/WA) tersimpan ke Turso Cloud.`);
      return true;
    }
  } catch {}
  return false;
}

function scheduleAuthCloudBackup(immediate = false) {
  const run = async () => {
    cloudAuthBackupTimer = null;
    await backupAuthBundleNow(12000);
  };
  if (cloudAuthBackupTimer) clearTimeout(cloudAuthBackupTimer);
  if (immediate) {
    run();
  } else {
    cloudAuthBackupTimer = setTimeout(run, 15000);
  }
}

async function clearCloudAuthBackup() {
  lastCloudAuthSignature = "";
  skipNextCloudRestore = true;
  try {
    await callPythonWaCs({ action: "bridge-auth-save", clear: true }, 8000);
  } catch {}
}

async function startSocket() {
  await restoreAuthFromCloudIfMissing();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const wantsPairNow = Boolean(pendingWebPairingPhone || CLI_PAIR_MODE);
  const targetPhone = normalizePhone(pendingWebPairingPhone || currentPhone || DEFAULT_ADMIN_PHONE);
  pendingWebPairingPhone = "";

  console.log("==============================================================");
  console.log("  AUTO CS WHATSAPP BRIDGE (SOP VIP: Grup -> Private Chat)");
  console.log(`  Nomor Admin : +${targetPhone} (0${targetPhone.slice(2)})`);
  console.log(`  Server AI   : ${API_URL}`);
  console.log(`  WA Proto    : v${version.join(".")}`);
  console.log("==============================================================\n");

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "124.0.0"],
    syncFullHistory: false,
  });
  currentSock = sock;

  if (wantsPairNow && !state.creds.registered) {
    setTimeout(async () => {
      if (currentSock !== sock || isConnected) return;
      try {
        const code = await sock.requestPairingCode(targetPhone);
        const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log("\n==============================================================");
        console.log(`  🔑 KODE PAIRING WA UNTUK 0${targetPhone.slice(2)}:  ${formatted}`);
        console.log("  (Kode juga sudah dikirim otomatis ke layar Web /super-admin/wa-cs!)");
        console.log("==============================================================\n");
        await syncBridgeState({
          connected: false,
          phone: targetPhone,
          pairingCode: formatted,
          statusMessage: `Kode pairing siap untuk 0${targetPhone.slice(2)}`,
        });
      } catch (err) {
        console.error("⚠️ Gagal meminta kode pairing:", err?.message || err);
        await syncBridgeState({
          connected: false,
          clearPairingCode: true,
          statusMessage: `Gagal minta kode pairing: ${err?.message || "coba klik ulang"}`,
        });
      }
    }, 2800);
  }

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    scheduleAuthCloudBackup(false);
  });

  sock.ev.on("connection.update", async (update) => {
    if (currentSock !== sock) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr && !wantsPairNow) {
      console.log(`\n📱 QR CODE siap (atau klik tombol "BUILD KODE PAIRING 8 DIGIT" di Web /super-admin/wa-cs):\n`);
      qrcode.generate(qr, { small: true });
      await syncBridgeState({
        connected: false,
        statusMessage: "Bridge online — klik tombol Build Kode Pairing 8 Digit di atas!",
      });
    }

    if (connection === "open") {
      isConnected = true;
      const mePhone = normalizePhone(sock.user?.id) || targetPhone;
      currentPhone = mePhone;
      console.log(`\n✅ WHATSAPP +${mePhone} BERHASIL TERSAMBUNG! (${BRIDGE_VERSION})`);
      console.log("   • SOP Aktif: Pertanyaan di Grup -> dijawab singkat di Grup + detail & Foto HD dikirim via Private Chat!");
      console.log("   • Auto-Update Promo Excel aktif di PC: kode 'update promo 719' (Direct) & 'update promo 719 h-' (After Promo).\n");

      // Auto-Heal PreKeys Signal Protocol bila container baru lahir tanpa file pre-key-*.json
      try {
        const preKeyCount = fs.existsSync(AUTH_DIR)
          ? fs.readdirSync(AUTH_DIR).filter((f) => f.startsWith("pre-key-") && f.endsWith(".json")).length
          : 0;
        if (preKeyCount < 5 && typeof sock.uploadPreKeys === "function") {
          console.log(`🔧 [SIGNAL SELF-HEAL] Hanya ditemukan ${preKeyCount} PreKey di disk — mengunggah 30 PreKey segar ke WA...`);
          await sock.uploadPreKeys(30).catch((e) => {
            console.log("⚠️ [SIGNAL SELF-HEAL] uploadPreKeys warning:", e?.message || e);
          });
        }
      } catch {}

      await syncBridgeState({
        connected: true,
        phone: mePhone,
        clearPairingCode: true,
        statusMessage: `WhatsApp +${mePhone} aktif tersambung (${BRIDGE_VERSION})!`,
      });
      scheduleAuthCloudBackup(true);
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(
        `⚠️ Koneksi terputus (code ${statusCode || "?"}). ${
          isLoggedOut
            ? "Akun logout — menghapus sesi lama dan siap pairing ulang dari web."
            : "Menyambung ulang dalam 4 detik..."
        }`
      );
      await syncBridgeState({
        connected: false,
        statusMessage: isLoggedOut
          ? "Sesi WhatsApp terputus. Klik Build Kode Pairing untuk tautkan ulang."
          : "Menyambung ulang ke WhatsApp...",
      });
      if (isLoggedOut) {
        clearAuthDir();
        await clearCloudAuthBackup();
      }
      setTimeout(() => {
        if (currentSock === sock) startSocket();
      }, 4000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Setiap pesan masuk/keluar bisa memperbarui session Signal Protocol -> jadwalkan backup ringan ke Turso Cloud
      scheduleAuthCloudBackup(false);
      try {
        const jid = msg.key?.remoteJid || "";
        if (!jid || jid === "status@broadcast" || jid.endsWith("@broadcast")) continue;

        const msgId = msg.key?.id || "";
        if (msgId && botSentIds.has(msgId)) continue;

        const msgTs = Number(msg.messageTimestamp || 0);
        if (msgTs && msgTs < startUnixSec - 15) continue;

        const text = extractMessageText(msg).trim();
        const quotedText = extractQuotedText(msg);
        const fromMe = Boolean(msg.key?.fromMe);
        const isGroup = jid.endsWith("@g.us");

        // 0. JALUR KHUSUS AUTO-UPDATE PROMO EXCEL VIA KODE RAHASIA ("update promo 719" / "update promo 719 h-")
        //    Berjalan di Private Chat 085771123000 (baik dari nomor lain maupun fromMe) SEBELUM blokir PC & AI CS!
        const handledPromo = await handleWaPromoExcelFlow(sock, msg, jid, text, isGroup);
        if (handledPromo) continue;

        if (!text) continue;

        const senderName = msg.pushName || "Kak";
        const groupInfo = isGroup ? await getGroupInfo(sock, jid) : null;
        const groupName = isGroup ? groupInfo.name : "Private Chat VIP";

        // 1. Pesan dari PIC sendiri (fromMe)
        if (fromMe) {
          if (isEmergencyCommand(text)) {
            console.log(`⚡ [PERINTAH PIC] ${text}`);
            const res = await callPythonWaCs({
              action: "incoming",
              source: "WA_BRIDGE",
              message: text,
              sender: jid,
              senderName: "PIC",
              groupId: isGroup ? jid : "",
              groupName,
              isGroup,
              fromMe: true,
            });
            if (res?.shouldReply && res?.replyText) {
              const sent = await sock.sendMessage(jid, { text: res.replyText }, { quoted: msg });
              trackBotSent(sent);
            }
            continue;
          }

          // Human Takeover: jika PIC balas manual di grup ATAU di PC customer -> bot diam sementara!
          if (currentHumanTakeoverMins > 0 && (isGroup || !currentIgnorePrivateChats || isDmSessionActive(jid, msg.key?.remoteJidAlt))) {
            humanTakeoverUntil.set(jid, Date.now() + currentHumanTakeoverMins * 60 * 1000);
            console.log(`🤝 [HUMAN TAKEOVER] PIC balas manual di "${groupName}". Bot diam sementara ${currentHumanTakeoverMins} menit.`);
          }
          continue;
        }

        // 2. Cek Human Takeover aktif di chat ini
        const takeoverUntil = humanTakeoverUntil.get(jid) || 0;
        if (Date.now() < takeoverUntil) {
          const sisaMnt = Math.ceil((takeoverUntil - Date.now()) / 60000);
          console.log(`⏸️ [JEDA PIC] "${groupName}" (${senderName}) -> dilewati (sisa jeda ${sisaMnt} mnt)`);
          continue;
        }

        // 3. Buffer penggabung chat beruntun (2,6 detik) untuk Private Chat!
        //    Jika customer kirim 4-5 bubble pendek ("P" -> "mau tanya celana" -> "bukan chino" -> "eh chino aja"),
        //    digabung otomatis jadi 1 pesan utuh agar AI paham konteks penuh & tidak membalas 5 kali!
        if (!isGroup) {
          const altRemote = String(msg.key?.remoteJidAlt || "");
          if (currentIgnorePrivateChats && !isDmSessionActive(jid, altRemote)) {
            continue;
          }
          const bufKey = `DM::${jid}`;
          const existing = pendingMessageBuffers.get(bufKey);
          if (existing) {
            clearTimeout(existing.timer);
            existing.texts.push(text);
            if (quotedText && !existing.quotedText) existing.quotedText = quotedText;
            existing.lastMsg = msg;
          }
          const entry = existing || {
            texts: [text],
            quotedText,
            lastMsg: msg,
            senderName,
            altRemote,
            timer: null,
          };
          entry.timer = setTimeout(async () => {
            pendingMessageBuffers.delete(bufKey);
            const combinedText = entry.texts.join("\n").trim();
            try {
              console.log(`💬 [PC VIP] ${entry.senderName}: "${combinedText.replace(/\n/g, " | ").slice(0, 90)}"`);
              const aiRes = await callPythonWaCs({
                action: "incoming",
                source: "WA_BRIDGE_PC",
                message: combinedText,
                quotedMessage: entry.quotedText,
                sender: entry.altRemote || jid,
                senderName: entry.senderName,
                groupId: "",
                groupName: "Private Chat VIP",
                isGroup: false,
                fromMe: false,
              });
              if (!aiRes?.shouldReply) {
                console.log(`   ↳ Diam di PC (${aiRes?.reason || "IGNORED"}) [${aiRes?.elapsedMs || 0}ms]`);
                return;
              }
              markDmSessionActive([jid, entry.altRemote], aiRes.privateSessionMinutes || 30);
              const cards =
                Array.isArray(aiRes.privateMessages) && aiRes.privateMessages.length > 0
                  ? aiRes.privateMessages
                  : Array.isArray(aiRes.replyMessages) && aiRes.replyMessages.length > 0
                  ? aiRes.replyMessages
                  : [{ text: aiRes.replyText, imageUrl: aiRes.imageUrl || null }];
              const sentPhotos = await sendCardsToJid(sock, jid, cards, entry.lastMsg);
              console.log(`   ✅ Balasan PC VIP terkirim (${cards.length} pesan, ${sentPhotos} foto HD)!\n`);
              if (aiRes.notifyPicPhone && aiRes.notifyPicMessage) {
                const picJid = `${normalizePhone(aiRes.notifyPicPhone)}@s.whatsapp.net`;
                await sock.sendMessage(picJid, { text: aiRes.notifyPicMessage }).then(trackBotSent).catch(() => {});
                console.log(`   🔔 Alert eskalasi terkirim ke WA PIC (${aiRes.notifyPicPhone})!`);
              }
              if (aiRes.pauseAfterReply) {
                humanTakeoverUntil.set(jid, Date.now() + Math.max(10, currentHumanTakeoverMins) * 60 * 1000);
              }
            } catch (e) {
              console.error("❌ Error proses DM tergabung:", e?.message || e);
            }
          }, DEBOUNCE_WINDOW_MS);
          pendingMessageBuffers.set(bufKey, entry);
          continue;
        }

        // 4. Pesan masuk dari GRUP WA
        const { dmJid, allKeys } = await resolveParticipantDmJid(sock, jid, msg);
        console.log(`📩 [${groupName}] ${senderName}: "${text.slice(0, 70)}"`);

        const aiRes = await callPythonWaCs({
          action: "incoming",
          source: "WA_BRIDGE",
          message: text,
          quotedMessage: quotedText,
          sender: dmJid || msg.key?.participant || jid,
          senderName,
          groupId: jid,
          groupName,
          isGroup: true,
          fromMe: false,
        });

        if (!aiRes?.shouldReply) {
          console.log(`   ↳ Diam (${aiRes?.reason || "IGNORED"}) [${aiRes?.elapsedMs || 0}ms]`);
          continue;
        }

        // MODE SOP VIP: Balas 1 pesan sopan singkat di GRUP + langsung kirim Foto HD & detail ke PRIVATE CHAT!
        if (aiRes.deliveryMode === "GROUP_HANDOFF_TO_PRIVATE" && dmJid) {
          const groupNotice =
            aiRes.groupReplyText ||
            "Halo Kak, dengan senang hati akan saya bantu 😊 Mohon izin saya teruskan melalui *private chat (japri)* ya Kak agar tidak mengganggu member lain di grup ini 🙏";
          const pcCards =
            Array.isArray(aiRes.privateMessages) && aiRes.privateMessages.length > 0
              ? aiRes.privateMessages
              : Array.isArray(aiRes.replyMessages) && aiRes.replyMessages.length > 0
              ? aiRes.replyMessages
              : [{ text: aiRes.replyText, imageUrl: aiRes.imageUrl || null }];

          markDmSessionActive([dmJid, ...allKeys], aiRes.privateSessionMinutes || 30);
          console.log(`   ↳ SOP Hand-Off: Balas singkat di [${groupName}] + kirim ${pcCards.length} kartu ke PC (${dmJid})...`);

          // Jalankan BERSAMAAN: 1) Balas singkat di grup (quote customer), 2) Kirim kartu foto HD ke Private Chat!
          await sock.sendPresenceUpdate("composing", jid).catch(() => {});
          await sleep(1200);
          const sentGroup = await sock.sendMessage(jid, { text: groupNotice }, { quoted: msg });
          trackBotSent(sentGroup);
          await sock.sendPresenceUpdate("paused", jid).catch(() => {});

          try {
            const sentPhotos = await sendCardsToJid(sock, dmJid, pcCards, null);
            console.log(`   ✅ SOP Hand-Off SUKSES! Grup bersih + ${pcCards.length} pesan (${sentPhotos} foto HD) terkirim ke PC ${senderName}!\n`);
          } catch (dmErr) {
            console.error(`   ⚠️ Gagal kirim PC ke ${dmJid} (${dmErr?.message || dmErr}), fallback kirim ke grup...`);
            await sendCardsToJid(sock, jid, pcCards, null);
          }
          if (aiRes.notifyPicPhone && aiRes.notifyPicMessage) {
            const picJid = `${normalizePhone(aiRes.notifyPicPhone)}@s.whatsapp.net`;
            await sock.sendMessage(picJid, { text: aiRes.notifyPicMessage }).then(trackBotSent).catch(() => {});
            console.log(`   🔔 Alert eskalasi terkirim ke WA PIC (${aiRes.notifyPicPhone})!`);
          }
          if (aiRes.pauseAfterReply) {
            humanTakeoverUntil.set(dmJid, Date.now() + Math.max(10, currentHumanTakeoverMins) * 60 * 1000);
          }
          continue;
        }

        // MODE LANGSUNG DI GRUP (jika handoffToPrivateChat dimatikan)
        const outgoingCards =
          Array.isArray(aiRes.replyMessages) && aiRes.replyMessages.length > 0
            ? aiRes.replyMessages
            : [{ text: aiRes.replyText, imageUrl: aiRes.imageUrl || null }];
        const sentPhotos = await sendCardsToJid(sock, jid, outgoingCards, msg);
        console.log(`   ✅ Terkirim ${outgoingCards.length} pesan ke [${groupName}] (${sentPhotos} foto produk HD)!\n`);
      } catch (err) {
        console.error("❌ Error memproses pesan:", err?.message || err);
      }
    }
  });
}

async function startControlPoller() {
  const initState = await syncBridgeState({
    statusMessage: "Bridge aktif di PC — SOP Hand-Off Grup ke Private Chat siap!",
  });
  if (initState) {
    lastHandledPairingReq = Number(initState.pairingRequestedAt || 0);
    lastHandledLogoutReq = Number(initState.logoutRequestedAt || 0);
  }

  // Adaptive Polling Hemat Kuota 95%:
  // - Saat BELUM tersambung (menunggu klik Build Kode di Web): cek tiap 4 detik
  // - Saat SUDAH tersambung WA: cukup heartbeat ringan tiap 60 detik!
  const tick = async () => {
    try {
      const st = await syncBridgeState();
      if (st) {
        const reqLogout = Number(st.logoutRequestedAt || 0);
        if (reqLogout > lastHandledLogoutReq) {
          lastHandledLogoutReq = reqLogout;
          console.log("🔌 [WEB CMD] Permintaan putuskan tautan WA diterima dari Super Admin!");
          try {
            if (currentSock && isConnected) {
              await currentSock.logout().catch(() => {});
            }
          } catch {}
          await restartSocket(true, "");
        } else {
          const reqPair = Number(st.pairingRequestedAt || 0);
          if (reqPair > lastHandledPairingReq) {
            lastHandledPairingReq = reqPair;
            const target = normalizePhone(st.phone || currentPhone || DEFAULT_ADMIN_PHONE);
            console.log(`🔑 [WEB CMD] Tombol BUILD KODE PAIRING ditekan di Web untuk +${target}!`);
            await restartSocket(true, target);
          }
        }
      }
    } catch {}
    const nextMs = isConnected ? 60_000 : 4_000;
    setTimeout(tick, nextMs);
  };
  setTimeout(tick, isConnected ? 60_000 : 4_000);
}

if (HEALTH_PORT > 0) {
  const srv = http.createServer((req, res) => {
    const body = JSON.stringify({
      ok: true,
      service: "suko-wa-cs-bridge",
      connected: isConnected,
      uptimeSec: Math.floor(Date.now() / 1000) - startUnixSec,
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  });
  srv.listen(HEALTH_PORT, "0.0.0.0", () => {
    console.log(`🌐 Cloud Healthcheck HTTP aktif di port ${HEALTH_PORT} (/health)`);
  });
}

let isShuttingDown = false;
async function handleGracefulShutdown(sig) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`🛑 [${sig}] Graceful shutdown: menyimpan seluruh folder Signal/WA ke Turso Cloud & menutup socket...`);
  try {
    await backupAuthBundleNow(6000);
    if (currentSock) {
      currentSock.end(undefined);
    }
  } catch {}
  process.exit(0);
}
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));

startSocket().then(() => startControlPoller()).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

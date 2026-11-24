/**
 * wa-cs-bridge/index.mjs
 * =============================================================================
 * Bridge WhatsApp Ringan (Baileys) -> Python AI CS Engine (www.luqmanganteng.my.id)
 *
 * Cara pakai:
 *   1. npm install
 *   2. npm start
 *   3. Scan QR Code di terminal via WA HP (Perangkat Tertaut / Linked Devices)
 *   4. Kirim 1 chat di Grup Dummy -> klik "Segarkan" di /super-admin/wa-cs -> Aktifkan Grup!
 *
 * Keamanan Anti-Salah-Balas:
 *   - 100% logic saklar ON/OFF, blokir chat pribadi, & whitelist grup ada di server Python.
 *   - Human Takeover otomatis: jika PIC ikut membalas manual di grup, bot otomatis diam 10 menit!
 *   - Typing indicator natural (2,2 - 3,6 detik) sebelum membalas + kirim foto produk HD.
 * =============================================================================
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

const API_URL = (
  process.env.WA_CS_API_URL || "https://www.luqmanganteng.my.id/api/py_wa_cs"
).trim();
const API_SECRET = (
  process.env.WA_CS_SECRET ||
  process.env.WEBHOOK_SECRET ||
  "B4mb4ng123!Aman"
).trim();

const logger = pino({ level: "silent" });
const startUnixSec = Math.floor(Date.now() / 1000);

// Lacak ID pesan yang dikirim bot sendiri agar tidak dianggap human takeover / loop
const botSentIds = new Set();
// Peta jeda human takeover: groupId -> timestamp ms sampai kapan bot minggir
const humanTakeoverUntil = new Map();
// Cache nama grup: groupId -> { name, fetchedAt }
const groupNameCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHumanDelayMs() {
  return 2200 + Math.floor(Math.random() * 1400);
}

function extractMessageText(msg) {
  const m = msg?.message;
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.ephemeralMessage?.message) {
    return extractMessageText({ message: m.ephemeralMessage.message });
  }
  if (m.viewOnceMessage?.message) {
    return extractMessageText({ message: m.viewOnceMessage.message });
  }
  return "";
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

async function resolveGroupName(sock, jid) {
  const cached = groupNameCache.get(jid);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
    return cached.name;
  }
  try {
    const meta = await sock.groupMetadata(jid);
    const name = meta?.subject || jid;
    groupNameCache.set(jid, { name, fetchedAt: Date.now() });
    return name;
  } catch {
    return jid;
  }
}

async function fetchImageBuffer(imageUrl) {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength < 1024) return null;
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function callPythonWaCs(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-WA-CS-Secret": API_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(22000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, shouldReply: false, reason: `HTTP_${res.status}` };
  }
}

async function startBridge() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  console.log("==============================================================");
  console.log("  AUTO CS WHATSAPP BRIDGE (SUKO & Mu+Ku — Halo BCA AI Engine)");
  console.log(`  Server AI : ${API_URL}`);
  console.log(`  WA Proto  : v${version.join(".")}`);
  console.log("==============================================================\n");

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["SUKO Auto CS", "Chrome", "124.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 SCAN QR CODE INI DI WHATSAPP HP KAKAK:");
      console.log("   (Buka WA -> Titik 3 / Pengaturan -> Perangkat Tertaut -> Tautkan Perangkat)\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("\n✅ WHATSAPP BERHASIL TERSAMBUNG!");
      console.log("   • Chat pribadi teman 100% aman (diblokir otomatis oleh server).");
      console.log("   • Kirim 1 chat di Grup Dummy -> buka /super-admin/wa-cs -> klik 'Aktifkan Grup Ini'.");
      console.log("   • Perintah darurat dari WA Kakak: !csoff | !cson | !csstatus\n");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Koneksi terputus (code ${statusCode || "?"}). ${shouldReconnect ? "Menyambung ulang dalam 4 detik..." : "Akun logout. Hapus folder auth_info lalu jalankan ulang npm start."}`);
      if (shouldReconnect) {
        setTimeout(() => startBridge(), 4000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        const jid = msg.key?.remoteJid || "";
        if (!jid || jid === "status@broadcast" || jid.endsWith("@broadcast")) continue;

        const msgId = msg.key?.id || "";
        // Skip pesan yang baru saja dikirim oleh bot sendiri
        if (msgId && botSentIds.has(msgId)) continue;

        // Skip pesan lama sebelum bridge nyala
        const msgTs = Number(msg.messageTimestamp || 0);
        if (msgTs && msgTs < startUnixSec - 15) continue;

        const text = extractMessageText(msg).trim();
        if (!text) continue;

        const fromMe = Boolean(msg.key?.fromMe);
        const isGroup = jid.endsWith("@g.us");
        const sender = msg.key?.participant || jid;
        const senderName = msg.pushName || "Kak";
        const groupName = isGroup ? await resolveGroupName(sock, jid) : "Chat Pribadi";

        // 1. Jika pesan dari PIC sendiri (fromMe)
        if (fromMe) {
          if (isEmergencyCommand(text)) {
            console.log(`⚡ [PERINTAH PIC] ${text}`);
            const res = await callPythonWaCs({
              action: "incoming",
              source: "WA_BRIDGE",
              message: text,
              sender,
              senderName: "PIC",
              groupId: isGroup ? jid : "",
              groupName,
              isGroup,
              fromMe: true,
            });
            if (res?.shouldReply && res?.replyText) {
              const sent = await sock.sendMessage(jid, { text: res.replyText }, { quoted: msg });
              if (sent?.key?.id) botSentIds.add(sent.key.id);
            }
            continue;
          }

          // Jika PIC membalas manual di grup -> aktifkan Human Takeover Pause!
          if (isGroup) {
            const pauseMins = 10;
            humanTakeoverUntil.set(jid, Date.now() + pauseMins * 60 * 1000);
            console.log(`🤝 [HUMAN TAKEOVER] PIC membalas manual di "${groupName}". Bot diam sementara ${pauseMins} menit.`);
          }
          continue;
        }

        // 2. Cek apakah grup sedang dalam jeda Human Takeover
        if (isGroup) {
          const until = humanTakeoverUntil.get(jid) || 0;
          if (Date.now() < until) {
            const sisaMnt = Math.ceil((until - Date.now()) / 60000);
            console.log(`⏸️ [JEDA PIC] "${groupName}" (${senderName}): "${text.slice(0, 45)}" -> dilewati (sisa jeda ${sisaMnt} mnt)`);
            continue;
          }
        }

        // 3. Jika bukan grup (chat pribadi), tetap lempar hanya kalau bukan private?
        // Untuk keamanan ekstra & hemat request, langsung skip chat pribadi di sini juga jika bukan grup!
        if (!isGroup) {
          continue;
        }

        console.log(`📩 [${groupName}] ${senderName}: "${text.slice(0, 70)}"`);

        const aiRes = await callPythonWaCs({
          action: "incoming",
          source: "WA_BRIDGE",
          message: text,
          sender,
          senderName,
          groupId: jid,
          groupName,
          isGroup: true,
          fromMe: false,
        });

        if (!aiRes?.shouldReply || !aiRes?.replyText) {
          console.log(`   ↳ Diam (${aiRes?.reason || "IGNORED"}) [${aiRes?.elapsedMs || 0}ms]`);
          continue;
        }

        // Update durasi human takeover sesuai setting server bila berubah
        const delayMs = randomHumanDelayMs();
        console.log(`   ↳ Mengetik ${(delayMs / 1000).toFixed(1)} dtk... (${aiRes.reason}${aiRes.imageUrl ? " + FOTO HD" : ""})`);

        await sock.sendPresenceUpdate("composing", jid).catch(() => {});
        const [imgBuffer] = await Promise.all([
          aiRes.imageUrl ? fetchImageBuffer(aiRes.imageUrl) : Promise.resolve(null),
          sleep(delayMs),
        ]);

        let sent;
        if (imgBuffer) {
          sent = await sock.sendMessage(
            jid,
            { image: imgBuffer, caption: aiRes.replyText },
            { quoted: msg }
          );
        } else {
          sent = await sock.sendMessage(
            jid,
            { text: aiRes.replyText },
            { quoted: msg }
          );
        }

        if (sent?.key?.id) {
          botSentIds.add(sent.key.id);
          if (botSentIds.size > 300) {
            const first = botSentIds.values().next().value;
            botSentIds.delete(first);
          }
        }
        await sock.sendPresenceUpdate("paused", jid).catch(() => {});
        console.log(`   ✅ Terkirim ke [${groupName}]${imgBuffer ? " (dengan foto produk HD)" : ""}!\n`);
      } catch (err) {
        console.error("❌ Error memproses pesan:", err?.message || err);
      }
    }
  });
}

startBridge().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

/**
 * wa-cs-bridge/index.mjs
 * =============================================================================
 * Bridge WhatsApp Ringan (Baileys) -> Python AI CS Engine (www.luqmanganteng.my.id)
 *
 * Fitur Utama:
 *   - Sinkronisasi dua arah dengan tombol "BUILD KODE PAIRING 8 DIGIT" di Web
 *     (`/super-admin/wa-cs`) — cukup klik tombol di HP/browser, kode 8 digit
 *     langsung muncul di layar web!
 *   - Juga mendukung QR Code di terminal atau mode `npm run pair`.
 *   - 100% logic saklar ON/OFF, blokir chat pribadi, & whitelist grup ada di server Python.
 *   - Human Takeover otomatis: jika PIC ikut membalas manual di grup, bot diam 10 menit.
 *   - Typing indicator natural (2,2 - 3,6 detik) + kirim Foto Produk HD resmi!
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
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
const DEFAULT_ADMIN_PHONE = (process.env.WA_ADMIN_PHONE || "6281296393972")
  .replace(/[^0-9]/g, "")
  .replace(/^0/, "62");
const CLI_PAIR_MODE =
  process.argv.includes("--pair") || process.env.WA_USE_PAIRING === "1";

const AUTH_DIR = path.resolve("./auth_info");
const logger = pino({ level: "silent" });
const startUnixSec = Math.floor(Date.now() / 1000);

const botSentIds = new Set();
const humanTakeoverUntil = new Map();
const groupNameCache = new Map();

let currentSock = null;
let isConnected = false;
let currentPhone = DEFAULT_ADMIN_PHONE;
let currentHumanTakeoverMins = 10;
let lastHandledPairingReq = 0;
let lastHandledLogoutReq = 0;
let pendingWebPairingPhone = "";
let isRestarting = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHumanDelayMs() {
  return 2200 + Math.floor(Math.random() * 1400);
}

function normalizePhone(raw) {
  const digits = String(raw || "").split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

function clearAuthDir() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch {}
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

async function callPythonWaCs(payload, timeoutMs = 22000) {
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

async function syncBridgeState(extra = {}) {
  try {
    const res = await callPythonWaCs(
      {
        action: "bridge-sync",
        connected: isConnected,
        phone: currentPhone,
        ...extra,
      },
      8000
    );
    if (!res?.success) return null;
    if (res.adminPhone) currentPhone = normalizePhone(res.adminPhone) || currentPhone;
    if (typeof res.humanTakeoverMinutes === "number") {
      currentHumanTakeoverMins = res.humanTakeoverMinutes;
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
    }
    pendingWebPairingPhone = requestPairingForPhone;
    await sleep(600);
  } finally {
    isRestarting = false;
  }
  startSocket();
}

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const wantsPairNow = Boolean(pendingWebPairingPhone || CLI_PAIR_MODE);
  const targetPhone = normalizePhone(pendingWebPairingPhone || currentPhone || DEFAULT_ADMIN_PHONE);
  pendingWebPairingPhone = "";

  console.log("==============================================================");
  console.log("  AUTO CS WHATSAPP BRIDGE (SUKO & Mu+Ku — Halo BCA AI Engine)");
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

  // Jika diminta pairing 8 digit (dari tombol web atau `npm run pair`)
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

  sock.ev.on("creds.update", saveCreds);

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
      console.log(`\n✅ WHATSAPP +${mePhone} BERHASIL TERSAMBUNG!`);
      console.log("   • Chat pribadi teman 100% aman (diblokir otomatis).");
      console.log("   • Kirim 1 chat di Grup Dummy -> buka /super-admin/wa-cs -> klik 'Aktifkan Grup Ini'.");
      console.log("   • Perintah darurat dari WA Kakak: !csoff | !cson | !csstatus\n");
      await syncBridgeState({
        connected: true,
        phone: mePhone,
        clearPairingCode: true,
        statusMessage: `WhatsApp +${mePhone} aktif tersambung!`,
      });
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
      }
      setTimeout(() => {
        if (currentSock === sock) startSocket();
      }, 4000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        const jid = msg.key?.remoteJid || "";
        if (!jid || jid === "status@broadcast" || jid.endsWith("@broadcast")) continue;

        const msgId = msg.key?.id || "";
        if (msgId && botSentIds.has(msgId)) continue;

        const msgTs = Number(msg.messageTimestamp || 0);
        if (msgTs && msgTs < startUnixSec - 15) continue;

        const text = extractMessageText(msg).trim();
        if (!text) continue;

        const fromMe = Boolean(msg.key?.fromMe);
        const isGroup = jid.endsWith("@g.us");
        const sender = msg.key?.participant || jid;
        const senderName = msg.pushName || "Kak";
        const groupName = isGroup ? await resolveGroupName(sock, jid) : "Chat Pribadi";

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

          if (isGroup && currentHumanTakeoverMins > 0) {
            humanTakeoverUntil.set(jid, Date.now() + currentHumanTakeoverMins * 60 * 1000);
            console.log(`🤝 [HUMAN TAKEOVER] PIC membalas manual di "${groupName}". Bot diam sementara ${currentHumanTakeoverMins} menit.`);
          }
          continue;
        }

        if (isGroup) {
          const until = humanTakeoverUntil.get(jid) || 0;
          if (Date.now() < until) {
            const sisaMnt = Math.ceil((until - Date.now()) / 60000);
            console.log(`⏸️ [JEDA PIC] "${groupName}" (${senderName}) -> dilewati (sisa jeda ${sisaMnt} mnt)`);
            continue;
          }
        }

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

        const outgoingCards =
          Array.isArray(aiRes.replyMessages) && aiRes.replyMessages.length > 0
            ? aiRes.replyMessages
            : [{ text: aiRes.replyText, imageUrl: aiRes.imageUrl || null }];

        const delayMs = randomHumanDelayMs();
        console.log(`   ↳ Mengetik ${(delayMs / 1000).toFixed(1)} dtk... (${aiRes.reason} • ${outgoingCards.length} kartu produk)`);

        await sock.sendPresenceUpdate("composing", jid).catch(() => {});
        // Unduh semua foto produk secara paralel selama simulasi mengetik agar pengiriman cepat & mulus!
        const [imgBuffers] = await Promise.all([
          Promise.all(
            outgoingCards.map((card) =>
              card.imageUrl ? fetchImageBuffer(card.imageUrl) : Promise.resolve(null)
            )
          ),
          sleep(delayMs),
        ]);

        let sentPhotos = 0;
        for (let i = 0; i < outgoingCards.length; i++) {
          const card = outgoingCards[i];
          const imgBuffer = imgBuffers[i];
          const captionText = String(card.text || "").trim();
          if (!captionText && !imgBuffer) continue;

          // Quote pesan customer pada kartu pertama saja agar tampilan rapi
          const sendOpts = i === 0 ? { quoted: msg } : {};
          let sent;
          if (imgBuffer) {
            sentPhotos++;
            sent = await sock.sendMessage(
              jid,
              { image: imgBuffer, caption: captionText },
              sendOpts
            );
          } else {
            sent = await sock.sendMessage(
              jid,
              { text: captionText },
              sendOpts
            );
          }

          if (sent?.key?.id) {
            botSentIds.add(sent.key.id);
            if (botSentIds.size > 300) {
              const first = botSentIds.values().next().value;
              botSentIds.delete(first);
            }
          }

          if (i < outgoingCards.length - 1) {
            await sleep(1100);
          }
        }
        await sock.sendPresenceUpdate("paused", jid).catch(() => {});
        console.log(`   ✅ Terkirim ${outgoingCards.length} pesan ke [${groupName}] (${sentPhotos} foto produk HD)!\n`);
      } catch (err) {
        console.error("❌ Error memproses pesan:", err?.message || err);
      }
    }
  });
}

// Loop heartbeat & penerima perintah tombol "BUILD KODE PAIRING" dari Web Super Admin
async function startControlPoller() {
  // Baca state awal agar tidak memicu request lama sebelum bridge dinyalakan
  const initState = await syncBridgeState({
    statusMessage: "Bridge aktif di PC — siap menerima klik Build Kode Pairing dari Web!",
  });
  if (initState) {
    lastHandledPairingReq = Number(initState.pairingRequestedAt || 0);
    lastHandledLogoutReq = Number(initState.logoutRequestedAt || 0);
  }

  setInterval(async () => {
    const st = await syncBridgeState();
    if (!st) return;

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
      return;
    }

    const reqPair = Number(st.pairingRequestedAt || 0);
    if (reqPair > lastHandledPairingReq) {
      lastHandledPairingReq = reqPair;
      const target = normalizePhone(st.phone || currentPhone || DEFAULT_ADMIN_PHONE);
      console.log(`🔑 [WEB CMD] Tombol BUILD KODE PAIRING ditekan di Web untuk +${target}!`);
      await restartSocket(true, target);
    }
  }, 3000);
}

startSocket().then(() => startControlPoller()).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

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
      console.log("   • SOP Aktif: Pertanyaan di Grup -> dijawab singkat di Grup + detail & Foto HD dikirim via Private Chat!");
      console.log("   • Chat pribadi teman yang bukan dari grup tetap 100% aman (diblokir di PC).\n");
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
        const quotedText = extractQuotedText(msg);
        if (!text) continue;

        const fromMe = Boolean(msg.key?.fromMe);
        const isGroup = jid.endsWith("@g.us");
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

startSocket().then(() => startControlPoller()).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

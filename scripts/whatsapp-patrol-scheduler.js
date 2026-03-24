/**
 * WhatsApp Security Patrol Scheduler
 * Phone-friendly version — uses Baileys (no browser/Chromium needed)
 *
 * Shift: 6:00 PM – 6:00 AM
 *   5:55 PM              → "Ebimo O SOW"  (Start of Watch)
 *   Every hour 6PM–5AM   → Patrol check-in message
 *   6:00 AM              → "EOW"          (End of Watch)
 *
 * Target: "154 Allen estate" WhatsApp contact or group
 *
 * ─── iPHONE SETUP (iSH app) ───────────────────────────────────────────────
 *  iSH is a free Linux terminal app for iPhone from the App Store.
 *
 *  1. Install "iSH Shell" from the App Store (search: iSH Shell).
 *
 *  2. Open iSH and run these commands to install Node.js:
 *       apk update
 *       apk add nodejs npm git
 *
 *  3. Create a folder and copy this script in:
 *       mkdir ~/patrol
 *       cd ~/patrol
 *
 *     To get this file onto your phone, the easiest ways:
 *       a) Email it to yourself → save → open in iSH via Files:
 *            cp /proc/self/fd/... ~/patrol/whatsapp-patrol-scheduler.js
 *       b) Use iSH's built-in Files access: tap the folder icon in iSH,
 *          then navigate to where you saved the file.
 *       c) Type it in directly (only if short).
 *
 *  4. Install dependencies:
 *       npm init -y
 *       npm install @whiskeysockets/baileys node-schedule qrcode-terminal
 *
 *  5. Run the scheduler:
 *       node whatsapp-patrol-scheduler.js
 *
 *  6. A QR code appears — scan it with:
 *       WhatsApp → Settings → Linked Devices → Link a Device
 *     Your session is saved, so you only scan once.
 *
 *  7. IMPORTANT — keep iSH running during your shift:
 *       - Go to Settings → iSH → Background App Refresh → ON
 *       - Leave iSH open (don't swipe it away)
 *       - Turn Auto-Lock off in iPhone Settings → Display & Brightness
 *         while on shift, or plug in your phone to keep it awake.
 *
 * ─── ANDROID SETUP (Termux, for reference) ───────────────────────────────
 *  1. Install Termux from F-Droid (NOT Google Play).
 *  2. pkg update && pkg upgrade -y && pkg install nodejs git -y
 *  3. mkdir ~/patrol && cd ~/patrol
 *  4. npm init -y
 *  5. npm install @whiskeysockets/baileys node-schedule qrcode-terminal
 *  6. node whatsapp-patrol-scheduler.js
 * ──────────────────────────────────────────────────────────────────────────
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import schedule from 'node-schedule';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { mkdir } from 'fs/promises';

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const TARGET_NAME   = '154 Allen estate';        // Group or contact name in WhatsApp
const AUTH_DIR      = './auth_info_patrol';      // Saved session folder

const SOW_MESSAGE   = 'Ebimo O SOW';             // 5:55 PM — Start of Watch
const EOW_MESSAGE   = 'EOW';                     // 6:00 AM — End of Watch
const PATROL_MESSAGE = (time) =>
  `Security Patrol Check-In — ${time}. All clear. 154 Allen Estate.`;

// ─── GLOBALS ──────────────────────────────────────────────────────────────────

let sock = null;       // active WhatsApp socket
let store = null;      // in-memory chat store
let schedulerStarted = false;

// ─── CONNECT ──────────────────────────────────────────────────────────────────

async function connect() {
  await mkdir(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  store = makeInMemoryStore({});
  store.readFromFile?.('./store_patrol.json');
  setInterval(() => store.writeToFile?.('./store_patrol.json'), 10_000);

  sock = makeWASocket.default({
    version,
    auth: state,
    printQRInTerminal: false,      // we handle QR ourselves below
    syncFullHistory: false,
  });

  store.bind(sock.ev);

  // ── Events ──────────────────────────────────────────────────────────────────

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp > Linked Devices > Link a Device:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('Logged out. Delete the auth_info_patrol folder and restart.');
      } else {
        console.log('Disconnected. Reconnecting in 5 s…');
        setTimeout(connect, 5000);
      }
    }

    if (connection === 'open') {
      console.log('WhatsApp connected. Patrol scheduler is active.\n');
      console.log('Schedule:');
      console.log('  5:55 PM         — Ebimo O SOW');
      console.log('  6 PM to 5 AM    — Hourly patrol check-in');
      console.log('  6:00 AM         — EOW\n');
      if (!schedulerStarted) {
        schedulerStarted = true;
        startScheduler();
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Load existing chats into store on startup
  sock.ev.on('chats.set', ({ chats }) => {
    store.chats.insertIfAbsent(...chats);
  });
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────

async function sendToTarget(message) {
  if (!sock) { console.error('Not connected yet.'); return; }

  try {
    // Search store chats first, then fetch from WhatsApp
    const allChats = store.chats.all?.() ?? [];
    let target = allChats.find(
      (c) => c.name?.toLowerCase() === TARGET_NAME.toLowerCase()
    );

    // If not in store, fetch groups directly
    if (!target) {
      const groups = await sock.groupFetchAllParticipating();
      const entry = Object.values(groups).find(
        (g) => g.subject?.toLowerCase() === TARGET_NAME.toLowerCase()
      );
      if (entry) target = { id: entry.id };
    }

    if (!target) {
      console.error(`Chat "${TARGET_NAME}" not found. Make sure the name matches exactly.`);
      return;
    }

    await sock.sendMessage(target.id, { text: message });

    const ts = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    console.log(`[${ts}] Sent to "${TARGET_NAME}": ${message}`);
  } catch (err) {
    console.error('Failed to send message:', err.message);
  }
}

// ─── SCHEDULER ────────────────────────────────────────────────────────────────

function startScheduler() {
  // 5:55 PM — Start of Watch
  schedule.scheduleJob('55 17 * * *', async () => {
    await sendToTarget(SOW_MESSAGE);
  });

  // Hourly check-ins: 6 PM through 5 AM (hours 18–23, 0–5)
  schedule.scheduleJob('0 18,19,20,21,22,23,0,1,2,3,4,5 * * *', async () => {
    const timeLabel = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    await sendToTarget(PATROL_MESSAGE(timeLabel));
  });

  // 6:00 AM — End of Watch
  schedule.scheduleJob('0 6 * * *', async () => {
    await sendToTarget(EOW_MESSAGE);
  });

  console.log('Scheduler running. Waiting for shift times…\n');
}

// ─── START ────────────────────────────────────────────────────────────────────

connect().catch(console.error);

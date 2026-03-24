/**
 * WhatsApp Security Patrol Scheduler
 *
 * Shift: 6:00 PM – 6:00 AM
 * 5:55 PM  → Sends "Ebimo O SOW" (Start of Watch)
 * Every hour on the hour (6 PM – 5 AM) → Sends patrol check-in
 * 6:00 AM  → Sends "EOW" (End of Watch)
 *
 * Target: "154 Allen estate" WhatsApp contact/group
 *
 * Setup:
 *   npm install whatsapp-web.js qrcode-terminal node-schedule
 *   node scripts/whatsapp-patrol-scheduler.js
 *   Scan the QR code with your WhatsApp mobile app once.
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

import qrcode from 'qrcode-terminal';
import schedule from 'node-schedule';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const TARGET_NAME = '154 Allen estate'; // Exact contact or group name in WhatsApp

const SOW_MESSAGE  = 'Ebimo O SOW';     // 5:55 PM — Start of Watch
const EOW_MESSAGE  = 'EOW';             // 6:00 AM — End of Watch
const PATROL_MESSAGE = (time) =>
  `Security Patrol Check-In — ${time}. All clear. 154 Allen Estate.`;

// ─── CLIENT SETUP ────────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'patrol-scheduler' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with WhatsApp on your phone:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp authenticated.');
});

client.on('ready', () => {
  console.log('✅ WhatsApp client ready. Patrol scheduler is active.\n');
  console.log('Schedule:');
  console.log('  5:55 PM       → SOW message sent');
  console.log('  6 PM – 5 AM   → Hourly patrol check-ins');
  console.log('  6:00 AM       → EOW message sent\n');
  startScheduler();
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️  WhatsApp disconnected:', reason);
});

// ─── SEND MESSAGE HELPER ─────────────────────────────────────────────────────

async function sendToTarget(message) {
  try {
    const chats = await client.getChats();

    // Search for the target contact or group by name (case-insensitive)
    const target = chats.find(
      (chat) => chat.name.toLowerCase() === TARGET_NAME.toLowerCase()
    );

    if (!target) {
      console.error(`❌ Chat "${TARGET_NAME}" not found. Check the name matches exactly in WhatsApp.`);
      return;
    }

    await client.sendMessage(target.id._serialized, message);
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    console.log(`[${ts}] ✅ Sent to "${TARGET_NAME}": ${message}`);
  } catch (err) {
    console.error('❌ Failed to send message:', err.message);
  }
}

// ─── SCHEDULER ───────────────────────────────────────────────────────────────

function startScheduler() {
  // 5:55 PM — Start of Watch
  schedule.scheduleJob('55 17 * * *', async () => {
    await sendToTarget(SOW_MESSAGE);
  });

  // Hourly patrol check-ins: 6 PM (18:00) through 5 AM (05:00)
  // Cron hours: 18,19,20,21,22,23,0,1,2,3,4,5
  schedule.scheduleJob('0 18,19,20,21,22,23,0,1,2,3,4,5 * * *', async () => {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    await sendToTarget(PATROL_MESSAGE(timeLabel));
  });

  // 6:00 AM — End of Watch
  schedule.scheduleJob('0 6 * * *', async () => {
    await sendToTarget(EOW_MESSAGE);
  });

  console.log('⏱️  Scheduler jobs registered. Waiting for shift times...\n');
}

// ─── START ────────────────────────────────────────────────────────────────────

client.initialize();

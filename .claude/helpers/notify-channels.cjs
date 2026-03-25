#!/usr/bin/env node
/**
 * notify-channels.cjs
 * Sends Claude Code hook events to Telegram and Discord.
 *
 * Required env vars (add to your shell profile or .env):
 *   TELEGRAM_BOT_TOKEN   — from @BotFather on Telegram
 *   TELEGRAM_CHAT_ID     — your chat/group ID
 *   DISCORD_WEBHOOK_URL  — from Discord channel Settings → Integrations → Webhooks
 *
 * Used by Claude Code hooks: Notification, Stop, SessionEnd
 */

'use strict';

const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID   || '';
const DISCORD_URL    = process.env.DISCORD_WEBHOOK_URL || '';

const EVENT_TYPE = process.argv[2] || 'notification'; // notification | stop | session-end

// ── Read stdin (hook passes JSON event data) ─────────────────────────────────
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => main(stdinData));
// If stdin never closes (no pipe), run after short delay
setTimeout(() => { if (!stdinData) main(''); }, 500);

// ── Main ─────────────────────────────────────────────────────────────────────
function main(raw) {
  let event = {};
  try { event = raw ? JSON.parse(raw) : {}; } catch (_) {}

  const msg = buildMessage(EVENT_TYPE, event);

  const promises = [];
  if (TELEGRAM_TOKEN && TELEGRAM_CHAT) promises.push(sendTelegram(msg));
  if (DISCORD_URL) promises.push(sendDiscord(msg));

  if (!promises.length) {
    console.error('[notify-channels] No credentials set. Add TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID and/or DISCORD_WEBHOOK_URL to your env.');
    process.exit(0); // don't block Claude
  }

  Promise.allSettled(promises).then(results => {
    results.forEach((r, i) => {
      const platform = i === 0 && TELEGRAM_TOKEN ? 'Telegram' : 'Discord';
      if (r.status === 'rejected') console.error(`[notify-channels] ${platform} error:`, r.reason);
    });
  });
}

// ── Message builder ───────────────────────────────────────────────────────────
function buildMessage(type, event) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });

  switch (type) {
    case 'notification':
      return `🔔 *Claude needs your attention*\n⏰ ${ts}\n📝 ${event.message || 'Waiting for input'}`;

    case 'stop':
      return `✅ *Claude finished responding*\n⏰ ${ts}\n💬 ${event.message || 'Task complete'}`;

    case 'session-end':
      return `🏁 *Session ended*\n⏰ ${ts}\nSession: \`${event.session_id || 'unknown'}\``;

    case 'task-complete':
      return `🎯 *Task complete*\n⏰ ${ts}\n${event.task || ''}`;

    default:
      return `🤖 *Claude Code* [${type}]\n⏰ ${ts}\n${JSON.stringify(event).slice(0, 200)}`;
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: TELEGRAM_CHAT, text, parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        parsed.ok ? resolve(parsed) : reject(new Error(parsed.description));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Discord ───────────────────────────────────────────────────────────────────
function sendDiscord(text) {
  return new Promise((resolve, reject) => {
    // Convert Markdown bold (*text*) to Discord bold (**text**)
    const discordText = text.replace(/\*(.*?)\*/g, '**$1**');
    const body = JSON.stringify({ content: discordText });
    const url = new URL(DISCORD_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        // Discord returns 204 No Content on success
        res.statusCode === 204 || res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

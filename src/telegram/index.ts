import 'node:process'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { handleMessage } from './handlers/message.js'
import {
  handleStart,
  handleHelp,
  handleClear,
  handleStatus,
  handleBash,
  handleCode,
  handleFileInfo,
  handleLs,
  handleRead,
} from './handlers/commands.js'
import { handleDocumentUpload, handlePhotoUpload, handleSendFile } from './handlers/files.js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) {
  console.error('[BMO] TELEGRAM_BOT_TOKEN is not set. Exiting.')
  process.exit(1)
}

// Log warning about missing Anthropic key
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[BMO] ANTHROPIC_API_KEY is not set. Claude chat will fail.')
}

const bot = new Telegraf(BOT_TOKEN)

// ── Commands ────────────────────────────────────────────────────────────────
bot.command('start', handleStart)
bot.command('help', handleHelp)
bot.command('clear', handleClear)
bot.command('status', handleStatus)
bot.command('bash', handleBash)
bot.command('code', handleCode)
bot.command('file', handleFileInfo)
bot.command('ls', handleLs)
bot.command('read', handleRead)
bot.command('send', handleSendFile)

// ── File uploads ─────────────────────────────────────────────────────────────
bot.on(message('document'), handleDocumentUpload)
bot.on(message('photo'), handlePhotoUpload)

// ── Text messages → Claude ───────────────────────────────────────────────────
bot.on(message('text'), handleMessage)

// ── Error handling ───────────────────────────────────────────────────────────
bot.catch((err: unknown, ctx) => {
  const errorMessage = err instanceof Error ? err.message : String(err)
  console.error(`[BMO] Unhandled error for ${ctx.updateType}:`, errorMessage)
  ctx.reply('An unexpected error occurred. Please try again.').catch(() => {})
})

// ── Launch ───────────────────────────────────────────────────────────────────
const startBot = async (): Promise<void> => {
  console.log('[BMO] Starting bot...')

  // Graceful shutdown
  process.once('SIGINT', () => {
    console.log('[BMO] Received SIGINT, stopping...')
    bot.stop('SIGINT')
  })
  process.once('SIGTERM', () => {
    console.log('[BMO] Received SIGTERM, stopping...')
    bot.stop('SIGTERM')
  })

  await bot.launch()
  console.log('[BMO] Bot is running.')
}

startBot().catch((err) => {
  console.error('[BMO] Failed to start bot:', err instanceof Error ? err.message : err)
  process.exit(1)
})

import { Context } from 'telegraf'
import { Message } from 'telegraf/types'
import { createWriteStream, mkdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { isAuthorized, sanitizeFilename, validateFilePath } from '../utils/security.js'

const UPLOAD_DIR = '/tmp/bmo_uploads'

// Ensure upload directory exists at module load time
try {
  mkdirSync(UPLOAD_DIR, { recursive: true })
} catch {
  // Already exists or permission issue - log it
  console.warn(`[BMO] Could not create upload dir: ${UPLOAD_DIR}`)
}

/**
 * Download a file from a URL to a local path.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const dest = createWriteStream(destPath)

    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        dest.destroy()
        reject(new Error(`HTTP ${res.statusCode} downloading file`))
        return
      }
      pipeline(res, dest).then(resolve).catch(reject)
    }).on('error', reject)
  })
}

/**
 * Handle incoming document uploads.
 * Saves the file to /tmp/bmo_uploads/.
 */
export async function handleDocumentUpload(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply('Unauthorized.')
    return
  }

  const msg = ctx.message as Message.DocumentMessage | undefined
  const doc = msg?.document
  if (!doc) {
    await ctx.reply('No document found in message.')
    return
  }

  const fileName = sanitizeFilename(doc.file_name ?? `file_${doc.file_id}`)
  const destPath = path.join(UPLOAD_DIR, fileName)

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id)
    await downloadFile(fileLink.href, destPath)
    await ctx.reply(
      `File saved: \`${destPath}\`\n` +
        `Size: ${(doc.file_size ?? 0 / 1024).toFixed(1)}KB\n\n` +
        `Use /read ${destPath} to view contents.`,
      { parse_mode: 'Markdown' }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await ctx.reply(`Failed to save file: ${msg}`)
  }
}

/**
 * Handle photo uploads.
 * Saves the highest-resolution photo to /tmp/bmo_uploads/.
 */
export async function handlePhotoUpload(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply('Unauthorized.')
    return
  }

  const msg = ctx.message as Message.PhotoMessage | undefined
  const photos = msg?.photo
  if (!photos || photos.length === 0) {
    await ctx.reply('No photo found in message.')
    return
  }

  // Use the highest resolution version (last in array)
  const photo = photos[photos.length - 1]
  const fileName = sanitizeFilename(`photo_${Date.now()}.jpg`)
  const destPath = path.join(UPLOAD_DIR, fileName)

  try {
    const fileLink = await ctx.telegram.getFileLink(photo.file_id)
    await downloadFile(fileLink.href, destPath)
    await ctx.reply(
      `Photo saved: \`${destPath}\`\n` +
        `Dimensions: ${photo.width}x${photo.height}`,
      { parse_mode: 'Markdown' }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await ctx.reply(`Failed to save photo: ${msg}`)
  }
}

/**
 * /send <filepath> — Send a file from the server back to the user.
 */
export async function handleSendFile(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply('Unauthorized.')
    return
  }

  const text = (ctx.message as Message.TextMessage | undefined)?.text ?? ''
  const filePath = text.replace(/^\/send\s*/i, '').trim()

  if (!filePath) {
    await ctx.reply('Usage: /send <filepath>\nExample: /send /tmp/bmo_uploads/result.txt')
    return
  }

  const safePath = validateFilePath(filePath, [UPLOAD_DIR, '/tmp'])
  if (!safePath) {
    await ctx.reply('Invalid or disallowed file path.')
    return
  }

  try {
    await ctx.replyWithDocument({ source: safePath })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await ctx.reply(`Failed to send file: ${msg}`)
  }
}

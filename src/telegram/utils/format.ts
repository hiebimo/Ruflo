/**
 * Formatting utilities for Telegram messages.
 * Telegram has a 4096 character limit per message.
 */

const TELEGRAM_MAX_LENGTH = 4096
const CODE_BLOCK_OVERHEAD = 10 // for ```\n...\n```

/**
 * Truncate a string to fit within Telegram's message limit.
 */
export function truncateToLimit(text: string, limit = TELEGRAM_MAX_LENGTH): string {
  if (text.length <= limit) return text
  const suffix = '\n...[truncated]'
  return text.slice(0, limit - suffix.length) + suffix
}

/**
 * Wrap text in a Markdown code block.
 * Truncates if necessary to fit in a single Telegram message.
 */
export function formatCodeBlock(code: string, language = ''): string {
  const maxCode = TELEGRAM_MAX_LENGTH - CODE_BLOCK_OVERHEAD - language.length
  const truncated = code.length > maxCode ? code.slice(0, maxCode) + '\n...[truncated]' : code
  return `\`\`\`${language}\n${truncated}\n\`\`\``
}

/**
 * Format command output (stdout + stderr) for display.
 */
export function formatOutput(stdout: string, stderr: string, exitCode: number): string {
  const parts: string[] = []

  if (stdout.trim()) {
    parts.push(`*stdout:*\n${formatCodeBlock(stdout.trim())}`)
  }
  if (stderr.trim()) {
    parts.push(`*stderr:*\n${formatCodeBlock(stderr.trim())}`)
  }
  if (!stdout.trim() && !stderr.trim()) {
    parts.push('_(no output)_')
  }

  const exitStr = exitCode === 0 ? '✅ exit 0' : `❌ exit ${exitCode}`
  parts.push(exitStr)

  const result = parts.join('\n\n')
  return truncateToLimit(result)
}

/**
 * Escape special MarkdownV2 characters for Telegram.
 * Used when parse_mode is MarkdownV2.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&')
}

/**
 * Split a long message into chunks that fit Telegram's limit.
 */
export function splitMessage(text: string, limit = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    // Try to split at a newline near the limit
    let splitAt = remaining.lastIndexOf('\n', limit)
    if (splitAt < limit / 2) {
      // No good newline; hard split
      splitAt = limit
    }

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * Format uptime in seconds to a human-readable string.
 */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)

  return parts.join(' ')
}

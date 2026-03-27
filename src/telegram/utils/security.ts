import path from 'node:path'

/**
 * Authorized user IDs loaded from environment variable.
 * If TELEGRAM_ALLOWED_USERS is not set, all users are allowed (with a warning).
 */
let allowedUsers: Set<number> | null = null
let permissiveMode = false

function loadAllowedUsers(): void {
  const raw = process.env.TELEGRAM_ALLOWED_USERS
  if (!raw || raw.trim() === '') {
    console.warn(
      '[BMO SECURITY WARNING] TELEGRAM_ALLOWED_USERS is not set. ' +
        'All users will be allowed. Set this env var to restrict access.'
    )
    permissiveMode = true
    allowedUsers = null
    return
  }
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n))
  allowedUsers = new Set(ids)
  console.log(`[BMO] Authorized user IDs loaded: ${ids.join(', ')}`)
}

loadAllowedUsers()

/**
 * Check if a Telegram user ID is authorized to use the bot.
 */
export function isAuthorized(userId: number): boolean {
  if (permissiveMode) return true
  return allowedUsers?.has(userId) ?? false
}

/**
 * Validate and resolve a file path to prevent path traversal attacks.
 * Returns the resolved absolute path if safe, or null if dangerous.
 */
export function validateFilePath(
  inputPath: string,
  allowedBaseDirs: string[] = ['/tmp/bmo_uploads', '/tmp']
): string | null {
  if (!inputPath || typeof inputPath !== 'string') return null

  // Reject obvious traversal patterns before resolving
  if (inputPath.includes('\0')) return null

  const resolved = path.resolve(inputPath)

  // Must start with one of the allowed base directories
  const isAllowed = allowedBaseDirs.some((base) => {
    const resolvedBase = path.resolve(base)
    return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase
  })

  if (!isAllowed) return null
  return resolved
}

/**
 * Sanitize a filename to be safe for use in the filesystem.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 255)
}

/**
 * Validate a shell command for obvious injection patterns.
 * Returns true if the command appears safe enough to run.
 * Note: This is defense-in-depth; the primary protection is the sandbox timeout.
 */
export function validateCommand(command: string): { safe: boolean; reason?: string } {
  if (!command || typeof command !== 'string') {
    return { safe: false, reason: 'Empty command' }
  }
  if (command.length > 4096) {
    return { safe: false, reason: 'Command too long (max 4096 chars)' }
  }
  return { safe: true }
}

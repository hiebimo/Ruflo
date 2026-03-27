import { Context } from 'telegraf'
import { Message } from 'telegraf/types'
import os from 'node:os'
import { executeBash, executeCode } from './executor.js'
import { clearHistory, historyLength } from '../claude/client.js'
import { formatOutput, formatCodeBlock, formatBytes, formatUptime } from '../utils/format.js'
import { isAuthorized, validateCommand } from '../utils/security.js'

const START_TIME = Date.now()

/**
 * Middleware-style auth check. Returns true if authorized, replies and returns false otherwise.
 */
async function requireAuth(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply('Unauthorized. You are not allowed to use this bot.')
    return false
  }
  return true
}

/**
 * /start — Welcome message.
 */
export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    `*Welcome to BMO!* 🤖\n\n` +
      `I'm your Claude Code assistant in Telegram. You can:\n\n` +
      `• Send any message to chat with Claude\n` +
      `• Use /bash to run shell commands\n` +
      `• Use /code to execute code snippets\n` +
      `• Use /read and /ls to browse files\n\n` +
      `Type /help for the full command list.`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * /help — List all commands.
 */
export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `*BMO Commands*\n\n` +
      `*Chat*\n` +
      `Just send a message to chat with Claude claude-sonnet-4-6\n\n` +
      `*General*\n` +
      `/start - Welcome message\n` +
      `/help - Show this help\n` +
      `/clear - Clear conversation history\n` +
      `/status - Bot status and memory info\n\n` +
      `*Execution*\n` +
      `/bash <command> - Run a shell command\n` +
      `/code <language>\\n<code> - Execute a code snippet\n` +
      `  Supported: python, javascript/node, bash\n\n` +
      `*Files*\n` +
      `/file - How to upload files\n` +
      `/send <filepath> - Send a file to you\n` +
      `/ls [path] - List directory contents\n` +
      `/read <file> - Read file contents\n\n` +
      `*Tips*\n` +
      `• Files are uploaded to /tmp/bmo\\_uploads/\n` +
      `• Execution timeout: 30 seconds\n` +
      `• Max conversation history: 20 messages`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * /clear — Clear conversation history.
 */
export async function handleClear(ctx: Context): Promise<void> {
  if (!(await requireAuth(ctx))) return
  const userId = ctx.from!.id
  clearHistory(userId)
  await ctx.reply('Conversation history cleared.')
}

/**
 * /status — Show bot status.
 */
export async function handleStatus(ctx: Context): Promise<void> {
  if (!(await requireAuth(ctx))) return
  const userId = ctx.from!.id

  const uptimeSecs = Math.floor((Date.now() - START_TIME) / 1000)
  const memUsage = process.memoryUsage()
  const msgCount = historyLength(userId)

  await ctx.reply(
    `*BMO Status*\n\n` +
      `*Model:* claude-sonnet-4-6\n` +
      `*Uptime:* ${formatUptime(uptimeSecs)}\n` +
      `*Your history:* ${msgCount} messages\n\n` +
      `*Memory (process)*\n` +
      `RSS: ${formatBytes(memUsage.rss)}\n` +
      `Heap used: ${formatBytes(memUsage.heapUsed)}\n` +
      `Heap total: ${formatBytes(memUsage.heapTotal)}\n\n` +
      `*System*\n` +
      `Platform: ${os.platform()} ${os.arch()}\n` +
      `Node: ${process.version}`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * /bash <command> — Execute a shell command.
 */
export async function handleBash(ctx: Context): Promise<void> {
  if (!(await requireAuth(ctx))) return

  const text = (ctx.message as Message.TextMessage | undefined)?.text ?? ''
  const command = text.replace(/^\/bash\s*/i, '').trim()

  if (!command) {
    await ctx.reply('Usage: /bash <command>\nExample: /bash ls -la /tmp')
    return
  }

  const validation = validateCommand(command)
  if (!validation.safe) {
    await ctx.reply(`Command rejected: ${validation.reason}`)
    return
  }

  const waitMsg = await ctx.reply('Running...')

  const result = await executeBash(command)
  const output = formatOutput(result.stdout, result.stderr, result.exitCode)

  await ctx.telegram.editMessageText(
    waitMsg.chat.id,
    waitMsg.message_id,
    undefined,
    output,
    { parse_mode: 'Markdown' }
  ).catch(() =>
    ctx.telegram.editMessageText(
      waitMsg.chat.id,
      waitMsg.message_id,
      undefined,
      output
    )
  )
}

/**
 * /code <language>\n<code> — Execute a code snippet.
 */
export async function handleCode(ctx: Context): Promise<void> {
  if (!(await requireAuth(ctx))) return

  const text = (ctx.message as Message.TextMessage | undefined)?.text ?? ''
  // Strip the /code command prefix
  const body = text.replace(/^\/code\s*/i, '')
  const newlineIdx = body.indexOf('\n')

  if (newlineIdx === -1) {
    await ctx.reply(
      'Usage:\n/code <language>\n<your code here>\n\nExample:\n/code python\nprint("Hello, World!")'
    )
    return
  }

  const language = body.slice(0, newlineIdx).trim()
  const code = body.slice(newlineIdx + 1)

  if (!language) {
    await ctx.reply('Please specify a language. Supported: python, javascript/node, bash')
    return
  }

  if (!code.trim()) {
    await ctx.reply('Please provide code to execute.')
    return
  }

  const waitMsg = await ctx.reply(`Running ${language} code...`)

  const result = await executeCode(language, code)
  const output = formatOutput(result.stdout, result.stderr, result.exitCode)

  await ctx.telegram.editMessageText(
    waitMsg.chat.id,
    waitMsg.message_id,
    undefined,
    output,
    { parse_mode: 'Markdown' }
  ).catch(() =>
    ctx.telegram.editMessageText(
      waitMsg.chat.id,
      waitMsg.message_id,
      undefined,
      output
    )
  )
}

/**
 * /file — Instructions for sending files.
 */
export async function handleFileInfo(ctx: Context): Promise<void> {
  await ctx.reply(
    `*File Handling*\n\n` +
      `*Uploading files to the bot:*\n` +
      `Simply send any document/file to this chat. It will be saved to /tmp/bmo\\_uploads/\n\n` +
      `*Commands:*\n` +
      `/ls [path] - List files in a directory\n` +
      `  Default: /tmp/bmo\\_uploads\n\n` +
      `/read <file> - Read file contents\n` +
      `  Example: /read /tmp/bmo\\_uploads/myfile.txt\n\n` +
      `/send <filepath> - Send a file back to you\n` +
      `  Example: /send /tmp/bmo\\_uploads/result.py`,
    { parse_mode: 'Markdown' }
  )
}

/**
 * /ls [path] — List directory contents.
 */
export async function handleLs(ctx: Context): Promise<void> {
  if (!(await requireAuth(ctx))) return

  const text = (ctx.message as Message.TextMessage | undefined)?.text ?? ''
  const dirPath = text.replace(/^\/ls\s*/i, '').trim() || '/tmp/bmo_uploads'

  const result = await executeBash(`ls -la "${dirPath}"`)
  const output = formatOutput(result.stdout, result.stderr, result.exitCode)

  await ctx.reply(output, { parse_mode: 'Markdown' })
}

/**
 * /read <file> — Read file contents.
 */
export async function handleRead(ctx: Context): Promise<void> {
  if (!(await requireAuth(ctx))) return

  const text = (ctx.message as Message.TextMessage | undefined)?.text ?? ''
  const filePath = text.replace(/^\/read\s*/i, '').trim()

  if (!filePath) {
    await ctx.reply('Usage: /read <filepath>\nExample: /read /tmp/bmo_uploads/notes.txt')
    return
  }

  const result = await executeBash(`head -c 4000 "${filePath}"`)
  if (result.exitCode !== 0) {
    await ctx.reply(`Error reading file:\n${result.stderr || 'Unknown error'}`)
    return
  }

  const content = result.stdout
  if (!content.trim()) {
    await ctx.reply('File is empty.')
    return
  }

  // Try to detect language from extension for syntax highlighting
  const ext = filePath.split('.').pop() ?? ''
  const langMap: Record<string, string> = {
    ts: 'typescript', js: 'javascript', py: 'python', sh: 'bash',
    json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml',
    html: 'html', css: 'css', rs: 'rust', go: 'go',
  }
  const lang = langMap[ext] ?? ext

  const formatted = formatCodeBlock(content, lang)
  await ctx.reply(formatted, { parse_mode: 'Markdown' }).catch(() =>
    ctx.reply(formatted)
  )
}

import { Context } from 'telegraf'
import { Message } from 'telegraf/types'
import { chat } from '../claude/client.js'
import { splitMessage } from '../utils/format.js'
import { isAuthorized } from '../utils/security.js'

const TYPING_INTERVAL_MS = 4000
const STREAM_BUFFER_FLUSH_MS = 800

/**
 * Handle incoming text messages — stream response from Claude.
 */
export async function handleMessage(ctx: Context): Promise<void> {
  const userId = ctx.from?.id
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply('Unauthorized. You are not allowed to use this bot.')
    return
  }

  const text = (ctx.message as Message.TextMessage | undefined)?.text
  if (!text) return

  // Ignore messages that look like commands (they are handled elsewhere)
  if (text.startsWith('/')) return

  // Send initial "typing" indicator
  let typingInterval: ReturnType<typeof setInterval> | null = null
  let sentMessage: Message.TextMessage | null = null
  let accumulated = ''
  let lastUpdateTime = Date.now()

  try {
    await ctx.sendChatAction('typing')
    typingInterval = setInterval(() => {
      ctx.sendChatAction('typing').catch(() => {})
    }, TYPING_INTERVAL_MS)

    // Send a placeholder message we'll edit as chunks arrive
    sentMessage = await ctx.reply('...', { parse_mode: 'Markdown' })

    for await (const chunk of chat(userId, text)) {
      accumulated += chunk

      // Throttle edits to avoid Telegram rate limits
      const now = Date.now()
      if (now - lastUpdateTime >= STREAM_BUFFER_FLUSH_MS) {
        lastUpdateTime = now
        try {
          await ctx.telegram.editMessageText(
            sentMessage.chat.id,
            sentMessage.message_id,
            undefined,
            accumulated,
            { parse_mode: 'Markdown' }
          )
        } catch {
          // If edit fails (e.g. parse error), continue accumulating
        }
      }
    }

    // Final update with the complete response
    if (accumulated) {
      const chunks = splitMessage(accumulated)

      // Update the first message
      await ctx.telegram
        .editMessageText(
          sentMessage.chat.id,
          sentMessage.message_id,
          undefined,
          chunks[0],
          { parse_mode: 'Markdown' }
        )
        .catch(() =>
          ctx.telegram.editMessageText(
            sentMessage!.chat.id,
            sentMessage!.message_id,
            undefined,
            chunks[0]
          )
        )

      // Send any overflow chunks as separate messages
      for (let i = 1; i < chunks.length; i++) {
        await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() =>
          ctx.reply(chunks[i])
        )
      }
    }
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : 'Unknown error occurred'
    if (sentMessage) {
      await ctx.telegram
        .editMessageText(
          sentMessage.chat.id,
          sentMessage.message_id,
          undefined,
          `Error: ${errMsg}`
        )
        .catch(() => {})
    } else {
      await ctx.reply(`Error: ${errMsg}`)
    }
  } finally {
    if (typingInterval) clearInterval(typingInterval)
  }
}

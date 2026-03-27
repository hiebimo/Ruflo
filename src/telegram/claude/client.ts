import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'
const MAX_HISTORY = 20
const SYSTEM_PROMPT =
  'You are BMO, a helpful AI assistant in Telegram. You help with coding, answer questions, ' +
  'and can execute code and shell commands. Be concise and clear in your responses. ' +
  'When showing code, use appropriate markdown formatting.'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

const client = new Anthropic()

// Per-user conversation history
const histories = new Map<number, Message[]>()

/**
 * Get or initialize conversation history for a user.
 */
function getHistory(userId: number): Message[] {
  if (!histories.has(userId)) {
    histories.set(userId, [])
  }
  return histories.get(userId)!
}

/**
 * Append a message to a user's history, pruning to MAX_HISTORY.
 */
function appendMessage(userId: number, message: Message): void {
  const history = getHistory(userId)
  history.push(message)
  // Keep at most MAX_HISTORY messages
  if (history.length > MAX_HISTORY) {
    histories.set(userId, history.slice(history.length - MAX_HISTORY))
  }
}

/**
 * Clear conversation history for a user.
 */
export function clearHistory(userId: number): void {
  histories.set(userId, [])
}

/**
 * Get the number of messages in a user's history.
 */
export function historyLength(userId: number): number {
  return getHistory(userId).length
}

/**
 * Send a message to Claude and stream back the response.
 * Yields text chunks as they arrive.
 */
export async function* chat(
  userId: number,
  userMessage: string
): AsyncGenerator<string> {
  // Add user message to history
  appendMessage(userId, { role: 'user', content: userMessage })

  const history = getHistory(userId)
  // Build messages array: all but the last (user) are existing history context
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let fullResponse = ''

  try {
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    })

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        const text = chunk.delta.text
        fullResponse += text
        yield text
      }
    }

    // Save assistant response to history
    if (fullResponse) {
      appendMessage(userId, { role: 'assistant', content: fullResponse })
    }
  } catch (error) {
    // Remove the user message we added if the request fails
    const hist = getHistory(userId)
    if (hist.length > 0 && hist[hist.length - 1].role === 'user') {
      hist.pop()
    }
    throw error
  }
}

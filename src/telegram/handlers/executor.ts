import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const execAsync = promisify(exec)
const TIMEOUT_MS = 30_000

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

const SUPPORTED_LANGUAGES: Record<string, { bin: string; ext: string }> = {
  python: { bin: 'python3', ext: 'py' },
  python3: { bin: 'python3', ext: 'py' },
  javascript: { bin: 'node', ext: 'js' },
  js: { bin: 'node', ext: 'js' },
  node: { bin: 'node', ext: 'js' },
  bash: { bin: 'bash', ext: 'sh' },
  sh: { bin: 'bash', ext: 'sh' },
}

/**
 * Execute a shell command with a 30s timeout.
 */
export async function executeBash(command: string): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024, // 1MB
      shell: '/bin/bash',
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & {
      stdout?: string
      stderr?: string
      code?: number | string
      killed?: boolean
      signal?: string
    }
    if (error.killed || error.signal === 'SIGTERM') {
      return {
        stdout: error.stdout ?? '',
        stderr: 'Process killed: execution exceeded 30s timeout',
        exitCode: 124,
      }
    }
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error),
      exitCode: typeof error.code === 'number' ? error.code : 1,
    }
  }
}

/**
 * Execute a code snippet in the given language.
 * Writes the code to a temp file and runs the appropriate interpreter.
 */
export async function executeCode(
  language: string,
  code: string
): Promise<ExecResult> {
  const lang = language.toLowerCase().trim()
  const langConfig = SUPPORTED_LANGUAGES[lang]

  if (!langConfig) {
    return {
      stdout: '',
      stderr: `Unsupported language: "${language}". Supported: python, javascript/node, bash`,
      exitCode: 1,
    }
  }

  let tmpDir: string | null = null
  let tmpFile: string | null = null

  try {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bmo_code_'))
    tmpFile = path.join(tmpDir, `snippet.${langConfig.ext}`)
    await writeFile(tmpFile, code, 'utf8')

    const command = `${langConfig.bin} ${tmpFile}`
    return await executeBash(command)
  } finally {
    // Cleanup temp files
    if (tmpFile) {
      await unlink(tmpFile).catch(() => {})
    }
    if (tmpDir) {
      await executeBash(`rm -rf ${tmpDir}`).catch(() => {})
    }
  }
}

/**
 * List directory contents safely.
 */
export async function listDirectory(dirPath: string): Promise<ExecResult> {
  return executeBash(`ls -la "${dirPath}"`)
}

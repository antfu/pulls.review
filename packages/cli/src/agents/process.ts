import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface JsonLinesExit { code: number | null, stderr: string }

/**
 * Runs a CLI that reads its prompt from stdin and prints one JSON object per stdout line,
 * yielding each parsed line and,
 * last, how the process ended. Lines that are not JSON (banners, warnings) are skipped.
 * Aborting the signal kills the process.
 */
export async function* spawnJsonLines(bin: string, args: string[], { cwd, signal, stdin }: { cwd: string, signal: AbortSignal, stdin: string }): AsyncGenerator<{ line: unknown } | { exit: JsonLinesExit }> {
  const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], signal })
  // The prompt carries the manifest and diffs, far beyond what an argument may hold.
  child.stdin.on('error', () => {})
  child.stdin.end(stdin)
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => stderr = (stderr + chunk).slice(-4000))
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.name === 'AbortError')
        resolve(null)
      else
        reject(error.code === 'ENOENT' ? new Error(`${bin} is not installed (not on PATH).`) : error)
    })
    child.on('close', resolve)
  })

  for await (const text of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    try {
      yield { line: JSON.parse(text) }
    }
    catch {}
  }
  yield { exit: { code: await exited, stderr: stderr.trim() } }
}

/** The version number in the CLI's `--version`, or `undefined` when it is not on `PATH` or fails to run. */
export function readVersion(bin: string, args = ['--version']): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => stdout += chunk)
    child.on('error', () => resolve(undefined))
    child.on('close', code => resolve(code === 0 ? stdout.match(/\d+\.\d[\w.-]*/)?.[0] : undefined))
  })
}

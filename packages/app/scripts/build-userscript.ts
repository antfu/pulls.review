// Build both userscript filenames so existing installs keep receiving updates.
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

export function getSha(): string {
  if (process.env.BUILD_REVISION)
    return process.env.BUILD_REVISION
  try {
    return execSync('git rev-parse --short HEAD', { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  }
  catch {
    // Source archives and Docker contexts do not contain .git. Hash source content
    // so a changed embed still gets a new cache key without Git metadata.
    const root = fileURLToPath(new URL('../src', import.meta.url))
    const hash = createHash('sha256')
    for (const file of readdirSync(root, { recursive: true, withFileTypes: true }).filter(file => file.isFile()).sort((a, b) => join(a.parentPath, a.name).localeCompare(join(b.parentPath, b.name)))) {
      if (!file.parentPath.includes('.generated'))
        hash.update(readFileSync(join(file.parentPath, file.name)))
    }
    return hash.digest('hex').slice(0, 12)
  }
}

export async function buildUserscript() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf-8')) as { version: string }
  const sha = getSha()
  const version = `${pkg.version}.${formatDate(new Date())}-${sha}`

  const source = `
// ==UserScript==
// @name         Diffwise for GitHub Pull Requests
// @namespace    https://diffwise.shyim.de
// @version      ${version}
// @description  Adds a Diffwise review drawer to GitHub pull request pages
// @author       antfu
// @match        https://github.com/*
// @icon         https://github.com/favicon.ico
// @require      https://diffwise.shyim.de/embed/diffs-embed.js?${sha}
// @grant        none
// @run-at       document-idle
// @updateURL    https://diffwise.shyim.de/pulls-review-github.user.js
// @downloadURL  https://diffwise.shyim.de/pulls-review-github.user.js
// @supportURL   https://github.com/antfu/pulls.review/issues
// @homepageURL  https://diffwise.shyim.de
// ==/UserScript==

;(() => {
  // Mount the Diffwise embed panel Web Component
  if (!document.querySelector('pulls-review-embed-panel'))
    document.body.appendChild(document.createElement('pulls-review-embed-panel'))
})()
`

  await fs.writeFile(join(root, 'public/pulls-review-github.user.js'), source)
  // Legacy alias - see the module comment above.
  await fs.writeFile(join(root, 'public/diffs-github.user.js'), source)
  process.stdout.write(`✓ userscript built (version ${version})\n`)
}

// Stamps `userscript/diffs-github.user.js` (the checked-in template) with a
// build-specific version and a cache-busted `@require` URL, writing the result to
// `public/pulls-review-github.user.js` (gitignored, like `public/embed/` - see
// scripts/build-embed-css.ts) so Vite's publicDir copy serves it at
// https://pulls.review/pulls-review-github.user.js. `@updateURL`/`@downloadURL` in the
// template already point userscript managers at that same URL for auto-updates.
//
// The same source is also written to the legacy `public/diffs-github.user.js` path
// (the script's name before the site's rename to pulls.review), so userscript
// managers that installed it from that URL keep receiving updates rather than going
// stale. Drop this once telemetry/support requests show nobody's still on it.
import { execSync } from 'node:child_process'
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
  return execSync('git rev-parse --short HEAD', { cwd: fileURLToPath(new URL('..', import.meta.url)) }).toString().trim()
}

export async function buildUserscript() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf-8')) as { version: string }
  const sha = getSha()
  const version = `${pkg.version}.${formatDate(new Date())}-${sha}`

  const source = `
// ==UserScript==
// @name         pulls.review for GitHub Pull Requests
// @namespace    https://pulls.review
// @version      ${version}
// @description  Adds a pulls.review-powered review drawer to GitHub pull request pages
// @author       antfu
// @match        https://github.com/*
// @icon         https://github.com/favicon.ico
// @require      https://pulls.review/embed/diffs-embed.js?${sha}
// @grant        none
// @run-at       document-idle
// @updateURL    https://pulls.review/pulls-review-github.user.js
// @downloadURL  https://pulls.review/pulls-review-github.user.js
// @supportURL   https://github.com/antfu/pulls.review/issues
// @homepageURL  https://pulls.review
// ==/UserScript==

;(() => {
  // Mount the pulls.review embed panel Web Component from pulls.review
  if (!document.querySelector('pulls-review-embed-panel'))
    document.body.appendChild(document.createElement('pulls-review-embed-panel'))
})()
`

  await fs.writeFile(join(root, 'public/pulls-review-github.user.js'), source)
  // Legacy alias - see the module comment above.
  await fs.writeFile(join(root, 'public/diffs-github.user.js'), source)
  process.stdout.write(`✓ userscript built (version ${version})\n`)
}

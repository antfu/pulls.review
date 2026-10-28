import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const image = process.argv[2] || 'pulls-review:migration'
const name = `pulls-smoke-${randomUUID()}`
const volume = `${name}-data`
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
let origin
async function start() {
  docker('run', '-d', '--name', name, '-p', '127.0.0.1::3000', '-v', `${volume}:/data`, '-e', 'ANALYSIS_RUNNER_ENABLED=false', '-e', 'GITHUB_WEBHOOK_SECRET=synthetic-secret', '-e', 'PUBLIC_ORIGIN=https://review.example', '-e', 'SESSION_SECRET=synthetic-session-secret-at-least-32-characters', '-e', 'GITHUB_CLIENT_ID=synthetic-client', '-e', 'GITHUB_CLIENT_SECRET=synthetic-client-secret', image)
  origin = `http://${docker('port', name, '3000/tcp')}`
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(`${origin}/health/ready`).then(r => r.ok).catch(() => false))
      return
    await setTimeout(500)
  }
  throw new Error(`Container did not become ready: ${docker('logs', name)}`)
}
const sqlite = code => docker('exec', name, 'node', '-e', `const D=require('/app/server/node_modules/better-sqlite3'); const db=new D('/data/pulls-review.sqlite'); ${code}; db.close()`)
try {
  docker('volume', 'create', volume)
  await start()
  assert.notEqual(docker('exec', name, 'id', '-u'), '0')
  for (const path of ['/', '/inbox', '/upload', '/gh/o/r/123', '/gh/o/r/compare/main...branch/feature', '/gh/o/r/commit/abc']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200, path)
    assert.match(response.headers.get('content-type'), /text\/html/)
  }
  const authHeaders = { 'Content-Type': 'application/json', 'Origin': 'https://review.example' }
  const login = await fetch(`${origin}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ provider: 'github', callbackURL: '/inbox' }),
  })
  assert.equal(login.status, 200)
  const redirect = new URL((await login.json()).url)
  assert.equal(redirect.origin, 'https://github.com')
  assert.equal(redirect.searchParams.get('redirect_uri'), 'https://review.example/api/auth/callback')
  const cookies = login.headers.getSetCookie()
  assert.ok(cookies.length > 0)
  assert.ok(cookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('Secure')))
  const invalidCallback = await fetch(`${origin}/api/auth/callback?code=fake&state=invalid`, { redirect: 'manual' })
  assert.equal(invalidCallback.status, 302)
  assert.match(invalidCallback.headers.get('location'), /error=/)
  const logout = await fetch(`${origin}/api/auth/sign-out`, { method: 'POST', headers: authHeaders, body: '{}' })
  assert.equal(logout.status, 200)
  assert.ok(logout.headers.getSetCookie().some(cookie => cookie.includes('Max-Age=0')))
  const publicSession = await fetch(`${origin}/api/auth/get-session`)
  assert.equal(await publicSession.json(), null)
  const blockedToken = await fetch(`${origin}/api/auth/get-access-token`, { method: 'POST', headers: authHeaders, body: '{}' })
  assert.equal(blockedToken.status, 404)
  const config = await fetch(`${origin}/api/config`)
  assert.equal(config.status, 200)
  assert.ok(await config.json())
  assert.equal((await fetch(`${origin}/api/unknown`)).status, 404)
  assert.equal((await fetch(`${origin}/api/github/webhook`, { method: 'POST', body: '{}' })).status, 401)
  const body = '{ "zen": "test" }'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('synthetic-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('hex')
  const ping = await fetch(`${origin}/api/github/webhook`, { method: 'POST', body, headers: { 'X-GitHub-Event': 'ping', 'X-Hub-Signature-256': `sha256=${signature}` } })
  assert.deepEqual(await ping.json(), { ok: true, pong: true })
  for (const path of ['/embed/diffs-embed.js', '/pulls-review-github.user.js'])
    assert.equal((await fetch(origin + path)).status, 200)
  sqlite('db.prepare(\'INSERT INTO user_config VALUES (?, ?, ?, ?)\').run(42, \'test\', \'synthetic-ciphertext\', 123)')
  docker('exec', name, 'node', 'scripts/database.mjs', 'backup', '/data/pulls-review.sqlite', '/data/backup.sqlite')
  docker('exec', name, 'node', 'scripts/database.mjs', 'restore', '/data/backup.sqlite', '/data/restored.sqlite')
  docker('kill', name)
  docker('rm', name)
  await start()
  assert.equal(sqlite('console.log(db.prepare(\'SELECT updated_at FROM user_config WHERE github_user_id = 42\').get().updated_at)'), '123')
  console.log('Verified container health, non-root runtime, API/webhook routing, deep links, embed, persistence, backup and restore')
}
finally {
  try {
    docker('rm', '-f', name)
  }
  catch { /* Start may have failed before creating the container. */ }
  docker('volume', 'rm', volume)
}

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sealJson, unsealJson } from '../packages/server/src/encryption.ts'
import { backup, importLegacy, migrateDatabase } from './database.mjs'

const require = createRequire(new URL('../packages/server/package.json', import.meta.url))
const Sqlite = require('better-sqlite3')

const directory = mkdtempSync(join(tmpdir(), 'pulls-migration-'))
const source = join(directory, 'export.sql')
const destination = join(directory, 'imported.sqlite')
try {
  migrateDatabase(join(directory, 'fresh.sqlite'))
  migrateDatabase(join(directory, 'fresh.sqlite'))
  const journal = JSON.parse(readFileSync(new URL('../packages/server/migrations/meta/_journal.json', import.meta.url), 'utf8'))
  const schema = journal.entries.slice(0, 7).map(entry => readFileSync(new URL(`../packages/server/migrations/${entry.tag}.sql`, import.meta.url), 'utf8')).join('\n')
  const ciphertext = await sealJson({ secret: 'synthetic-config' }, 'test-key')
  writeFileSync(source, `${schema}
INSERT INTO user_config VALUES (42, 'octo', '${ciphertext}', 100);
INSERT INTO analysis_result (id, owner, repo, pr_number, author_login, result_json, updated_at) VALUES (8, 'o', 'r', 1, 'bot', '{}', 100);
INSERT INTO github_installation VALUES (9, 'o', 'User', 'selected', 1, 100, 100, NULL);
INSERT INTO github_repository VALUES (10, 9, 'o', 'r', 1, 0, 'main', 100, 100, NULL);
INSERT INTO analysis_job (id, owner, repo, pr_number, trigger_type, status, config_source_type, attempts, created_at, updated_at) VALUES ('job', 'o', 'r', 1, 'webhook', 'running', 'repository', 1, 100, 100);
INSERT INTO analysis_attempt (job_id, attempt_number, status, started_at) VALUES ('job', 1, 'running', 100);
INSERT INTO automation_config (scope_type, scope_key, enabled, created_at, updated_at, llm_ciphertext) VALUES ('repository', 'o/r', 1, 100, 100, '${ciphertext}');
INSERT INTO automation_usage VALUES ('repository', 'o/r', '2026-10', 2, 100);
INSERT INTO analysis_feedback (result_id, owner, repo, pr_number, github_user_id, rating, created_at, updated_at) VALUES (8, 'o', 'r', 1, 42, 'useful', 100, 100);
`)
  const kv = join(directory, 'installations.json')
  writeFileSync(kv, JSON.stringify([{ id: 9, suspended: false }, { id: 11, accountLogin: 'other', updatedAt: 50 }]))
  importLegacy(source, destination, kv)
  const db = new Sqlite(destination)
  try {
    db.pragma('journal_mode = WAL')
    assert.equal(db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get().count, 9)
    assert.equal(db.prepare('SELECT suspended FROM github_installation WHERE id = 9').get().suspended, 1)
    assert.equal(db.prepare('SELECT account_login FROM github_installation WHERE id = 11').get().account_login, 'other')
    assert.equal(db.prepare('SELECT status FROM analysis_job').get().status, 'queued')
    assert.equal(db.prepare('SELECT status FROM analysis_attempt').get().status, 'failed')
    const stored = db.prepare('SELECT ciphertext FROM user_config').get().ciphertext
    assert.deepEqual(await unsealJson(stored, 'test-key'), { secret: 'synthetic-config' })
    db.prepare('UPDATE user_config SET updated_at = 200').run()
    const snapshot = join(directory, 'backup.sqlite')
    await backup(destination, snapshot)
    const restored = join(directory, 'restored.sqlite')
    await backup(snapshot, restored)
    const verify = new Sqlite(restored)
    assert.equal(verify.prepare('SELECT updated_at FROM user_config').get().updated_at, 200)
    verify.close()
    assert.throws(() => importLegacy(source, destination), /Destination exists/)
    writeFileSync(source, readFileSync(source, 'utf8').replace('github_login TEXT NOT NULL', 'github_login INTEGER NOT NULL'))
    assert.throws(() => importLegacy(source, join(directory, 'invalid.sqlite')), /Unexpected legacy schema/)
  }
  finally {
    db.close()
  }
  console.log('Verified D1 import, KV reconciliation, encrypted data, interrupted jobs, WAL backup and restore')
}
finally {
  rmSync(directory, { recursive: true, force: true })
}

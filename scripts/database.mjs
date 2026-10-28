import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const moduleRoot = process.env.SQLITE_MODULE_ROOT || resolve(root, 'packages/server/package.json')
const require = createRequire(moduleRoot)
const Sqlite = require('better-sqlite3')

const driverRoot = resolve(dirname(moduleRoot), 'node_modules/drizzle-orm/better-sqlite3')
const { drizzle } = await import(pathToFileURL(resolve(driverRoot, 'index.js')).href)
const { migrate } = await import(pathToFileURL(resolve(driverRoot, 'migrator.js')).href)

const migrationsFolder = process.env.MIGRATIONS_PATH || resolve(root, 'packages/server/migrations')
const tables = ['user_config', 'analysis_result', 'github_installation', 'github_repository', 'analysis_job', 'analysis_attempt', 'automation_config', 'automation_usage', 'analysis_feedback']
const quote = value => `"${value.replaceAll('"', '""')}"`
function integrity(db) {
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
}
function schema(db, table) {
  return {
    columns: db.pragma(`table_info(${quote(table)})`),
    indexes: db.pragma(`index_list(${quote(table)})`).map(index => ({
      unique: index.unique,
      partial: index.partial,
      columns: db.pragma(`index_xinfo(${quote(index.name)})`),
      where: index.partial ? db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(index.name).sql.split(/\bWHERE\b/i)[1].trim() : '',
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}

export function migrateDatabase(path) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Sqlite(path)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    migrate(drizzle(db), { migrationsFolder })
    integrity(db)
  }
  finally {
    db.close()
  }
}

/** Import legacy D1 SQL and optional complete KV record array into a new database. */
export function importLegacy(source, destination, installations) {
  if (existsSync(destination))
    throw new Error('Destination exists; import only into a new database')
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = `${destination}.importing`
  if (existsSync(temporary))
    throw new Error('An unfinished import exists; inspect it before retrying')
  const legacy = new Sqlite(':memory:')
  const expected = new Sqlite(':memory:')
  const target = new Sqlite(temporary)
  try {
    legacy.exec(readFileSync(source, 'utf8'))
    const journal = JSON.parse(readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8'))
    for (const entry of journal.entries.slice(0, 7))
      expected.exec(readFileSync(resolve(migrationsFolder, `${entry.tag}.sql`), 'utf8'))
    integrity(legacy)
    for (const table of tables)
      assert.deepEqual(schema(legacy, table), schema(expected, table), `Unexpected legacy schema: ${table}`)
    migrate(drizzle(target), { migrationsFolder })
    target.transaction(() => {
      for (const table of tables) {
        const columns = legacy.pragma(`table_info(${quote(table)})`).map(column => column.name)
        const insert = target.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
        let count = 0
        for (const row of legacy.prepare(`SELECT * FROM ${quote(table)}`).iterate()) {
          insert.run(...columns.map(column => row[column]))
          count++
        }
        assert.equal(target.prepare(`SELECT count(*) AS count FROM ${quote(table)}`).get().count, count)
        // Compare complete values, including ciphertext, rather than only row counts.
        assert.deepEqual(target.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)} ORDER BY rowid`).all(), legacy.prepare(`SELECT * FROM ${quote(table)} ORDER BY rowid`).all())
      }
      for (const row of legacy.prepare('SELECT name, seq FROM sqlite_sequence').all()) {
        if (tables.includes(row.name))
          target.prepare('UPDATE sqlite_sequence SET seq = max(seq, ?) WHERE name = ?').run(row.seq, row.name)
      }
      if (installations) {
        const records = JSON.parse(readFileSync(installations, 'utf8'))
        assert.ok(Array.isArray(records), 'KV import must be a complete array of installation records')
        for (const record of records) {
          assert.ok(Number.isSafeInteger(record.id) && record.id > 0, 'Invalid installation ID')
          // SQL is authoritative for suspension/deletion; KV fills missing rows only.
          target.prepare(`INSERT INTO github_installation (id, account_login, account_type, repository_selection, suspended, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(record.id, record.accountLogin ?? null, record.accountType ?? null, record.repositorySelection ?? null, record.suspended ? 1 : 0, record.updatedAt ?? 0, record.updatedAt ?? 0)
        }
      }
      // A legacy running job has no live lease in the new process. Record the interrupted attempt.
      target.prepare('UPDATE analysis_attempt SET status = \'failed\', error_code = \'migration_interrupted\', finished_at = ? WHERE status = \'running\'').run(Date.now())
      target.prepare('UPDATE analysis_job SET status = CASE WHEN attempts >= 3 THEN \'failed\' ELSE \'queued\' END, error_code = \'migration_interrupted\', available_at = ? WHERE status = \'running\'').run(Date.now())
    })()
    integrity(target)
    target.close()
    renameSync(temporary, destination)
  }
  catch (error) {
    if (target.open)
      target.close()
    rmSync(temporary, { force: true })
    throw error
  }
  finally {
    legacy.close()
    expected.close()
  }
}

export async function backup(source, destination) {
  if (existsSync(destination))
    throw new Error('Backup destination already exists')
  mkdirSync(dirname(destination), { recursive: true })
  const db = new Sqlite(source, { readonly: true, fileMustExist: true })
  try {
    await db.backup(destination)
    const restored = new Sqlite(destination, { readonly: true })
    try {
      integrity(restored)
    }
    finally { restored.close() }
  }
  finally { db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, source, destination, installations] = process.argv.slice(2)
  if (command === 'migrate')
    migrateDatabase(source || process.env.DATABASE_PATH || resolve(root, 'packages/app/data/pulls-review.sqlite'))
  else if (command === 'import' && source && destination)
    importLegacy(source, destination, installations)
  else if ((command === 'backup' || command === 'restore') && source && destination)
    await backup(source, destination)
  else
    throw new Error('Usage: database.mjs migrate [database.sqlite] | import <D1.sql> <new.sqlite> [installations.json] | backup|restore <source.sqlite> <new.sqlite>')
  console.log('Database operation verified successfully')
}

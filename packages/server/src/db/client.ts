import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Sqlite from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Database = BetterSQLite3Database<typeof schema>

export function openDatabase(path: string, migrationsFolder: string) {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Sqlite(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = FULL')
  const db = drizzle(sqlite, { schema })
  try {
    migrate(db, { migrationsFolder })
  }
  catch (error) {
    sqlite.close()
    throw error
  }
  return { db, sqlite, close: () => sqlite.close() }
}

import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { testDatabase } from './db/testing'
import { deleteInstallationRecord, getInstallation, listInstallations, syncInstallationRecord, upsertGithubRepository } from './installations'

describe('installation persistence', () => {
  it('preserves webhook metadata and suspension when setup supplies only an ID', async () => {
    const storage = testDatabase()
    const env = { DB: storage.db }
    try {
      await syncInstallationRecord(env, { id: 9, accountLogin: 'octo', suspended: true }, 100)
      await syncInstallationRecord(env, { id: 9 }, 200)
      await syncInstallationRecord(env, { id: 10, accountLogin: 'other' }, 300)
      expect(await getInstallation(env, 9)).toMatchObject({ accountLogin: 'octo', suspended: true, updatedAt: 200 })
      await syncInstallationRecord(env, { id: 9, suspended: false }, 400)
      expect(await getInstallation(env, 9)).toMatchObject({ suspended: false })
      expect(await getInstallation(env, 99)).toBeNull()
    }
    finally {
      storage.close()
    }
  })

  it('retires an installation and its repositories together and excludes it from reads', async () => {
    const storage = testDatabase()
    const env = { DB: storage.db }
    try {
      await syncInstallationRecord(env, { id: 9 }, 100)
      await upsertGithubRepository(env, { id: 1, name: 'repo', owner: { login: 'octo' } }, 9, 100)
      await deleteInstallationRecord(env, 9, 200)
      expect(await getInstallation(env, 9)).toBeNull()
      expect(await listInstallations(env)).toEqual([])
      expect(storage.db.get(sql`SELECT removed_at FROM github_repository WHERE id = 1`)).toEqual({ removed_at: 200 })
    }
    finally {
      storage.close()
    }
  })

  it('rolls back retirement if updating the repository inventory fails', async () => {
    const storage = testDatabase()
    const env = { DB: storage.db }
    try {
      await syncInstallationRecord(env, { id: 9 }, 100)
      await upsertGithubRepository(env, { id: 1, name: 'repo', owner: { login: 'octo' } }, 9, 100)
      storage.sqlite.exec('CREATE TRIGGER reject_retirement BEFORE UPDATE ON github_repository BEGIN SELECT RAISE(ABORT, \'inventory unavailable\'); END')
      await expect(deleteInstallationRecord(env, 9, 200)).rejects.toThrow()
      expect(await getInstallation(env, 9)).toMatchObject({ id: 9, updatedAt: 100 })
    }
    finally {
      storage.close()
    }
  })
})

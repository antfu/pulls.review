import { describe, expect, it } from 'vitest'
import { createSqliteUserConfigRepository } from '../user-config'
import { testDatabase } from './testing'

describe('sQLite configuration storage', () => {
  it('uses conditional writes so racing clients cannot overwrite newer config', async () => {
    const storage = testDatabase()
    try {
      const repository = createSqliteUserConfigRepository(storage.db)
      const record = { githubLogin: 'o', ciphertext: 'encrypted-value', updatedAt: 100 }
      expect(await repository.putIfUnchanged!(42, record, null)).toBe(true)
      expect(await repository.putIfUnchanged!(42, { ...record, updatedAt: 101 }, null)).toBe(false)
      const outcomes = await Promise.all([
        repository.putIfUnchanged!(42, { ...record, updatedAt: 101 }, 100),
        repository.putIfUnchanged!(42, { ...record, updatedAt: 102 }, 100),
      ])
      expect(outcomes).toEqual([true, false])
      expect(await repository.get(42)).toMatchObject({ updatedAt: 101 })
    }
    finally {
      storage.close()
    }
  })
})

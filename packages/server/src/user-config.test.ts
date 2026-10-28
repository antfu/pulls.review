import type { StoredUserConfig, UserConfigRepository } from './user-config'
import { defaultUserConfig } from '@pulls.review/core/user-config'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthFixture } from './auth-testing'
import { handleUserConfig } from './user-config'

let fixture: Awaited<ReturnType<typeof createAuthFixture>>
beforeEach(async () => {
  fixture = await createAuthFixture()
})
afterEach(() => fixture.storage.close())

function memoryRepository() {
  const rows = new Map<number, StoredUserConfig>()
  const repository: UserConfigRepository = {
    get: async id => rows.get(id) ?? null,
    put: async (id, record) => {
      rows.set(id, record)
    },
    delete: async (id) => {
      rows.delete(id)
    },
  }
  return { rows, repository }
}

async function requestFor(method: string, body?: unknown): Promise<Request> {
  return new Request('https://pulls.shyim.de/api/user-config', {
    method,
    headers: {
      Cookie: fixture.cookie,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('handleUserConfig', () => {
  it('requires a GitHub session', async () => {
    const { repository } = memoryRepository()
    const response = await handleUserConfig(new Request('https://pulls.shyim.de/api/user-config'), fixture.env, { repository })
    expect(response?.status).toBe(401)
  })

  it('stores encrypted config and reads it back for the same user', async () => {
    const { rows, repository } = memoryRepository()
    const config = defaultUserConfig('de')
    config.settings.llm.provider = 'anthropic'
    config.settings.llm.anthropicApiKey = 'sk-do-not-store-plain'

    const put = await handleUserConfig(
      await requestFor('PUT', { config, baseUpdatedAt: null }),
      fixture.env,
      { repository, now: () => 1000 },
    )
    expect(put?.status).toBe(200)
    expect(await put?.json()).toMatchObject({ updatedAt: 1000, config: { settings: { locale: 'de' } } })
    expect(rows.get(42)?.ciphertext).not.toContain('sk-do-not-store-plain')

    const get = await handleUserConfig(await requestFor('GET', undefined), fixture.env, { repository })
    expect(await get?.json()).toEqual({ config, updatedAt: 1000 })
  })

  it('rejects a stale browser overwriting newer config', async () => {
    const { repository } = memoryRepository()
    const config = defaultUserConfig()
    await handleUserConfig(await requestFor('PUT', { config, baseUpdatedAt: null }), fixture.env, { repository, now: () => 1000 })
    const conflict = await handleUserConfig(
      await requestFor('PUT', { config, baseUpdatedAt: null }),
      fixture.env,
      { repository, now: () => 2000 },
    )
    expect(conflict?.status).toBe(409)
    expect(await conflict?.json()).toMatchObject({ error: 'config_conflict', updatedAt: 1000 })
  })

  it('rejects invalid config and deletes a stored one', async () => {
    const { rows, repository } = memoryRepository()
    const invalid = await handleUserConfig(
      await requestFor('PUT', { config: { version: 999 }, baseUpdatedAt: null }),
      fixture.env,
      { repository },
    )
    expect(invalid?.status).toBe(400)

    await handleUserConfig(
      await requestFor('PUT', { config: defaultUserConfig(), baseUpdatedAt: null }),
      fixture.env,
      { repository, now: () => 1000 },
    )
    const deleted = await handleUserConfig(await requestFor('DELETE', undefined), fixture.env, { repository })
    expect(deleted?.status).toBe(200)
    expect(rows.size).toBe(0)
  })
})

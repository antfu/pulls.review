import { describe, expect, it } from 'vitest'
import { sealJson, unsealJson } from './encryption'

const SECRET = 'test-session-secret-at-least-32-bytes!!'

describe('encrypted settings storage', () => {
  it('round-trips JSON and rejects the wrong key or tampered data', async () => {
    const value = { settings: { llm: { apiKey: 'secret' } } }
    const sealed = await sealJson(value, SECRET)
    expect(await unsealJson(sealed, SECRET)).toEqual(value)
    expect(await unsealJson(sealed, 'wrong secret')).toBeNull()
    const [iv, data] = sealed.split('.')
    expect(await unsealJson(`${iv}.${data!.slice(0, -4)}xxxx`, SECRET)).toBeNull()
    expect(await unsealJson(undefined, SECRET)).toBeNull()
    expect(await unsealJson('malformed', SECRET)).toBeNull()
  })
})

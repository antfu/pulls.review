import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearInstallationTokenCache, createAppJwt, getInstallationToken, pemToDer } from './github-app'

async function generateKeyPair(): Promise<{ pem: string, publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer
  let binary = ''
  for (const byte of new Uint8Array(der))
    binary += String.fromCharCode(byte)
  const b64 = btoa(binary).match(/.{1,64}/g)!.join('\n')
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`, publicKey: pair.publicKey }
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

describe('createAppJwt', () => {
  it('signs an RS256 JWT with iss/iat/exp within GitHub limits', async () => {
    const { pem, publicKey } = await generateKeyPair()
    const now = 1_700_000_000_000
    const jwt = await createAppJwt('123456', pem, now)
    const [header, payload, signature] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(header!)))).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload!)))
    expect(claims.iss).toBe('123456')
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600)
    expect(claims.iat).toBeLessThan(Math.floor(now / 1000))
    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      fromBase64Url(signature!),
      new TextEncoder().encode(`${header}.${payload}`),
    )
    expect(valid).toBe(true)
  })

  it('accepts PEM with literal \\n escapes (wrangler secret paste)', async () => {
    const { pem } = await generateKeyPair()
    expect(pemToDer(pem.replace(/\n/g, '\\n'))).toEqual(pemToDer(pem))
  })
})

describe('getInstallationToken', () => {
  beforeEach(() => clearInstallationTokenCache())

  it('exchanges a JWT for an installation token and caches it', async () => {
    const { pem } = await generateKeyPair()
    const env = { GITHUB_APP_ID: '42', GITHUB_APP_PRIVATE_KEY: pem } as never
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.github.com/app/installations/7/access_tokens')
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer eyJ/)
      return new Response(JSON.stringify({ token: 'ghs_test', expires_at: new Date(Date.now() + 3600_000).toISOString() }), { status: 201 })
    })
    await expect(getInstallationToken(env, 7, fetchFn as never)).resolves.toBe('ghs_test')
    await expect(getInstallationToken(env, 7, fetchFn as never)).resolves.toBe('ghs_test')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('throws when the App is not configured', async () => {
    await expect(getInstallationToken({} as never, 7)).rejects.toThrow(/not configured/)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCorsSafeFetch } from './runtime'

function sentHeaders(provider: string, headers: Record<string, string>): Headers {
  const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'))
  vi.stubGlobal('fetch', spy)
  void createCorsSafeFetch(provider)('https://example.test/v1/messages', { method: 'POST', headers })
  return new Headers(spy.mock.calls[0][1]?.headers)
}

const HEADERS = {
  'x-api-key': 'key',
  'anthropic-version': '2023-06-01',
  'x-stainless-os': 'MacOS',
  'x-stainless-retry-count': '0',
  'anthropic-dangerous-direct-browser-access': 'true',
}

describe('createCorsSafeFetch', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('strips telemetry and the browser-access opt-in for the Vercel AI Gateway', () => {
    const headers = sentHeaders('vercel-ai-gateway', HEADERS)
    expect([...headers.keys()].sort()).toEqual(['anthropic-version', 'x-api-key'])
  })

  it('keeps the browser-access opt-in for direct Anthropic calls', () => {
    const headers = sentHeaders('anthropic', HEADERS)
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(headers.has('x-stainless-os')).toBe(false)
    expect(headers.get('x-api-key')).toBe('key')
  })
})

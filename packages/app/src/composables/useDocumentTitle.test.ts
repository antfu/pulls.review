import type { EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useDocumentTitle } from './useDocumentTitle'

describe('useDocumentTitle', () => {
  let scope: EffectScope

  beforeEach(() => {
    scope = effectScope()
    document.title = ''
  })

  afterEach(() => {
    scope.stop()
    vi.unstubAllEnvs()
  })

  it('appends the app name to a subject', () => {
    scope.run(() => useDocumentTitle('feat: add thing (#123)'))
    expect(document.title).toBe('feat: add thing (#123) · Diffwise')
  })

  it('joins the subject with a custom separator', () => {
    scope.run(() => useDocumentTitle('Pull reviews made clear and organized', ' - '))
    expect(document.title).toBe('Pull reviews made clear and organized - Diffwise')
  })

  it('falls back to the plain app name when the subject is empty', () => {
    scope.run(() => useDocumentTitle(() => undefined))
    expect(document.title).toBe('Diffwise')

    scope.run(() => useDocumentTitle('   '))
    expect(document.title).toBe('Diffwise')
  })

  it('tracks a reactive subject', async () => {
    const subject = ref<string | undefined>(undefined)
    scope.run(() => useDocumentTitle(subject))
    expect(document.title).toBe('Diffwise')

    subject.value = 'Pasted diff'
    await nextTick()
    expect(document.title).toBe('Pasted diff · Diffwise')
  })

  it('leaves the tab title untouched in the embed build', () => {
    vi.stubEnv('PR_EMBED', 'true')
    document.title = 'github.com'

    scope.run(() => useDocumentTitle('feat: add thing (#123)'))

    expect(document.title).toBe('github.com')
  })
})

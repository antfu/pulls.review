import { staticCredentials } from '@pulls.review/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserscriptUpdate } from './userscript-update'

const DEPLOYED = '5155b792fd40178f4ab89fbdb0d193084189ea8b'

function stubDeployments() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify([{ sha: DEPLOYED }]), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The check runs detached; drain it. */
async function settle() {
  for (let i = 0; i < 5; i++)
    await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('useUserscriptUpdate', () => {
  it('offers an update when the latest production deployment is not the installed build', async () => {
    vi.stubEnv('PR_EMBED_SHA', 'abc1234')
    const fetchMock = stubDeployments()

    const { updateAvailable } = useUserscriptUpdate(staticCredentials())
    expect(updateAvailable.value).toBe(false)
    await settle()

    expect(updateAvailable.value).toBe(true)
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/repos/antfu/pulls.review/deployments?environment=Production')
  })

  it('stays quiet when the installed build is the deployed one', async () => {
    vi.stubEnv('PR_EMBED_SHA', DEPLOYED.slice(0, 7))
    stubDeployments()

    const { updateAvailable } = useUserscriptUpdate(staticCredentials())
    await settle()

    expect(updateAvailable.value).toBe(false)
  })

  it('checks once per interval, reusing the remembered answer in between', async () => {
    vi.stubEnv('PR_EMBED_SHA', 'abc1234')
    const fetchMock = stubDeployments()

    useUserscriptUpdate(staticCredentials())
    await settle()
    const { updateAvailable } = useUserscriptUpdate(staticCredentials())
    await settle()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(updateAvailable.value).toBe(true)
  })

  it('does nothing outside an embed build', async () => {
    const fetchMock = stubDeployments()

    const { updateAvailable } = useUserscriptUpdate(staticCredentials())
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(updateAvailable.value).toBe(false)
  })
})

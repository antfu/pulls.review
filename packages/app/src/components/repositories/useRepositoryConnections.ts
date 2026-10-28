import type { HostConfig, Installation, Repository } from './api'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { githubOauthSession } from '../../auth/github-oauth'
import { api, connectionPages } from './api'

/** Owns connection reads and cancels obsolete requests when the account changes. */
export function useRepositoryConnections() {
  const host = shallowRef<HostConfig>()
  const installations = shallowRef<Installation[]>([])
  const repositories = shallowRef<Repository[]>([])
  const installationId = ref('')
  const loading = ref(false)
  const loadingRepositories = ref(false)
  const error = ref(false)
  let connectionsRequest: AbortController | undefined
  let reposRequest: AbortController | undefined

  async function loadRepositories() {
    reposRequest?.abort()
    loadingRepositories.value = false
    repositories.value = []
    if (!installationId.value)
      return
    const controller = reposRequest = new AbortController()
    loadingRepositories.value = true
    error.value = false
    try {
      const items = await connectionPages<Repository>(`/api/github/installations/${installationId.value}/repositories`, 'repositories', controller.signal)
      if (!controller.signal.aborted)
        repositories.value = items.sort((a, b) => a.name.localeCompare(b.name))
    }
    catch {
      if (!controller.signal.aborted)
        error.value = true
    }
    finally {
      if (!controller.signal.aborted)
        loadingRepositories.value = false
    }
  }

  async function refresh() {
    connectionsRequest?.abort()
    reposRequest?.abort()
    loadingRepositories.value = false
    const controller = connectionsRequest = new AbortController()
    loading.value = true
    error.value = false
    installations.value = []
    repositories.value = []
    try {
      const config = await api<HostConfig>('/api/config', { signal: controller.signal })
      if (controller.signal.aborted)
        return
      host.value = config
      if (!githubOauthSession.value || !config.installations)
        return
      const items = await connectionPages<Installation>('/api/github/installations', 'installations', controller.signal)
      if (controller.signal.aborted)
        return
      installations.value = items
      const selected = items.find(item => String(item.id) === installationId.value) ?? items[0]
      const nextId = selected ? String(selected.id) : ''
      if (nextId === installationId.value)
        await loadRepositories()
      else
        installationId.value = nextId
    }
    catch {
      if (!controller.signal.aborted)
        error.value = true
    }
    finally {
      if (!controller.signal.aborted)
        loading.value = false
    }
  }

  watch(() => githubOauthSession.value?.id, refresh, { immediate: true })
  watch(installationId, loadRepositories)
  onScopeDispose(() => {
    connectionsRequest?.abort()
    reposRequest?.abort()
    loadingRepositories.value = false
  })
  return { host, installations, repositories, installationId, loading, loadingRepositories, error, refresh }
}

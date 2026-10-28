import type { UserConfig } from '@pulls.review/core/user-config'
import { watch } from 'vue'
import { autoFetchFullFile } from '../state/auto-fetch-full-file'
import { autoRefresh } from '../state/auto-refresh'
import { chatPanelWidth } from '../state/chat-panel'
import { isDark } from '../state/dark'
import { fileListLayout } from '../state/file-list'
import { groupAsideWidth } from '../state/group-aside'
import { groupNav, groupSidebarWidth } from '../state/group-nav'
import { layout } from '../state/layout'
import { showReviewComments } from '../state/review-comments'
import { settings } from '../state/settings'
import { smoothScroll } from '../state/smooth-scroll'
import { setSyntaxTheme, storedSyntaxTheme } from '../state/syntax-theme'
import { wrapLines } from '../state/wrap-lines'
import { githubOauthSession, isGithubOauthAvailable, refreshGithubOauthSession } from './github-oauth'

interface UserConfigResponse {
  config: UserConfig | null
  updatedAt: number | null
  error?: string
}

let started = false
let applying = false
let pushing = false
let pushQueued = false
let baseUpdatedAt: number | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined

/** Snapshot the browser's current settings and preferences for cloud sync. */
export function captureUserConfig(): UserConfig {
  return {
    version: 1,
    settings: {
      llm: { ...settings.value.llm },
      locale: settings.value.locale,
    },
    preferences: {
      dark: isDark.value,
      syntaxTheme: { light: String(storedSyntaxTheme.value.light), dark: String(storedSyntaxTheme.value.dark) },
      layout: layout.value,
      fileListLayout: fileListLayout.value,
      groupNav: groupNav.value,
      wrapLines: wrapLines.value,
      smoothScroll: smoothScroll.value,
      autoRefresh: autoRefresh.value,
      autoFetchFullFile: autoFetchFullFile.value,
      showReviewComments: showReviewComments.value,
      chatPanelWidth: chatPanelWidth.value,
      groupAsideWidth: groupAsideWidth.value,
      groupSidebarWidth: groupSidebarWidth.value,
    },
  }
}

/** Apply a config from the signed-in user's cloud record to browser state. */
export function applyUserConfig(config: UserConfig): void {
  applying = true
  try {
    settings.value = {
      llm: { ...config.settings.llm },
      locale: config.settings.locale,
    }

    const preferences = config.preferences
    isDark.value = preferences.dark
    setSyntaxTheme('light', preferences.syntaxTheme.light)
    setSyntaxTheme('dark', preferences.syntaxTheme.dark)
    layout.value = preferences.layout
    fileListLayout.value = preferences.fileListLayout
    groupNav.value = preferences.groupNav
    wrapLines.value = preferences.wrapLines
    smoothScroll.value = preferences.smoothScroll
    autoRefresh.value = preferences.autoRefresh
    autoFetchFullFile.value = preferences.autoFetchFullFile
    showReviewComments.value = preferences.showReviewComments
    chatPanelWidth.value = preferences.chatPanelWidth
    groupAsideWidth.value = preferences.groupAsideWidth
    groupSidebarWidth.value = preferences.groupSidebarWidth
  }
  finally {
    applying = false
  }
}

async function pushCurrentUserConfig(): Promise<void> {
  if (!githubOauthSession.value)
    return
  if (pushing) {
    pushQueued = true
    return
  }
  pushing = true
  try {
    do {
      pushQueued = false
      const response = await fetch('/api/user-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: captureUserConfig(), baseUpdatedAt }),
      })
      const body = await response.json().catch(() => null) as UserConfigResponse | null
      if (response.ok && body) {
        baseUpdatedAt = body.updatedAt
        continue
      }
      if (response.status === 409 && body?.config) {
        baseUpdatedAt = body.updatedAt
        applyUserConfig(body.config)
      }
      return
    } while (pushQueued)
  }
  catch {
    // Local settings remain authoritative until the next successful sync.
  }
  finally {
    pushing = false
  }
}

function schedulePush(): void {
  if (applying)
    return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushCurrentUserConfig(), 800)
}

function startWatching(): void {
  const sources = [
    settings,
    isDark,
    storedSyntaxTheme,
    layout,
    fileListLayout,
    groupNav,
    wrapLines,
    smoothScroll,
    autoRefresh,
    autoFetchFullFile,
    showReviewComments,
    chatPanelWidth,
    groupAsideWidth,
    groupSidebarWidth,
  ]
  for (const source of sources)
    watch(source, schedulePush, { deep: true })
}

/**
 * On the hosted site, load the signed-in GitHub user's encrypted config and
 * keep later changes synchronized. Signed-out and non-hosted builds keep the
 * existing local-only behavior.
 */
export async function ensureUserConfigSync(): Promise<void> {
  if (started || !isGithubOauthAvailable())
    return
  started = true

  const session = githubOauthSession.value ?? await refreshGithubOauthSession()
  if (!session)
    return

  try {
    const response = await fetch('/api/user-config', { credentials: 'same-origin' })
    if (!response.ok)
      return
    const body = await response.json().catch(() => null) as UserConfigResponse | null
    if (!body)
      return

    baseUpdatedAt = body.updatedAt
    if (body.config)
      applyUserConfig(body.config)
    else
      await pushCurrentUserConfig()

    startWatching()
  }
  catch {
    // The local copy remains usable if the config service is unavailable.
  }
}

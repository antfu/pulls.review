import type { CacheRepositories } from '@pulls.review/core/cache'
import type { Credentials } from '@pulls.review/core/types'
import type { App, InjectionKey } from 'vue'
import type { LlmRunner } from './analyze/llm-runner'
import { inject } from 'vue'
import { browserLlmRunner } from './analyze/browser-llm-runner'
import { createBrowserCache } from './cache/browser-cache'
import { settings } from './state/settings'

/**
 * Backends one app instance runs on (the SPA, the GitHub embed). Pages and
 * top-level composables inject it and hand it to store factories explicitly;
 * view components never read it.
 */
export interface AppContext {
  cache: CacheRepositories
  credentials: Credentials
  /** Absent when the build has no LLM support (the embed). */
  llm?: LlmRunner
}

export const appContextKey: InjectionKey<AppContext> = Symbol('app-context')

/** Read on every request, so a token saved in Settings applies without rebuilding a store. */
export const settingsCredentials: Credentials = {
  githubToken: async () => settings.value.githubToken || undefined,
  gitlabToken: async host => settings.value.gitlabTokens[host] || undefined,
}

export function installAppContext(app: App, context: AppContext = { cache: createBrowserCache(), credentials: settingsCredentials, llm: browserLlmRunner }): void {
  app.provide(appContextKey, context)
}

export function useAppContext(): AppContext {
  const context = inject(appContextKey)
  if (!context)
    throw new Error('useAppContext() called outside an app with installAppContext()')
  return context
}

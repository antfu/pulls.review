import type { CacheRepositories } from '@pulls.review/core/cache'
import type { Credentials } from '@pulls.review/core/types'
import type { App, InjectionKey } from 'vue'
import type { LlmRunner } from './analyze/llm-runner'
import { inject } from 'vue'
import { browserLlmRunner } from './analyze/browser-llm-runner'
import { getOauthApiBase } from './auth/github-oauth'
import { createBrowserCache } from './cache/browser-cache'

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

/**
 * Browser GitHub credentials are anonymous by default. Signed in via the
 * GitHub App, calls go through the Worker's same-origin `/api/github` proxy,
 * which injects the OAuth token server-side; no GitHub token enters the page.
 */
export const settingsCredentials: Credentials = {
  async githubToken() {
    return undefined
  },
  async githubApiBase() {
    return getOauthApiBase()
  },
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

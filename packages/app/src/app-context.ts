import type { App, InjectionKey } from 'vue'
import type { CacheStorage } from './cache/storage'
import { inject } from 'vue'
import { createBrowserCacheStorage } from './cache/storage'

/**
 * Backends one app instance runs on (the SPA, the GitHub embed). Pages and
 * top-level composables inject it and hand it to store factories explicitly;
 * view components never read it.
 */
export interface AppContext {
  storage: CacheStorage
}

export const appContextKey: InjectionKey<AppContext> = Symbol('app-context')

export function installAppContext(app: App, context: AppContext = { storage: createBrowserCacheStorage() }): void {
  app.provide(appContextKey, context)
}

export function useAppContext(): AppContext {
  const context = inject(appContextKey)
  if (!context)
    throw new Error('useAppContext() called outside an app with installAppContext()')
  return context
}

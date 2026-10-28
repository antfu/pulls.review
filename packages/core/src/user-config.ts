import type { LlmSettings } from './analyze/adapters/llm/settings'
import type { Locale } from './locales'
import { defaultLlmSettings, deriveProvider, isLlmProvider } from './analyze/adapters/llm/settings'
import { DEFAULT_LOCALE, isLocale } from './locales'

/** UI preferences that follow a signed-in GitHub user across browsers. */
export interface UserPreferences {
  dark: boolean
  syntaxTheme: { light: string, dark: string }
  layout: 'split' | 'unified'
  fileListLayout: 'tree' | 'list'
  groupNav: 'tabs' | 'sidebar'
  wrapLines: boolean
  smoothScroll: boolean
  autoRefresh: boolean
  autoFetchFullFile: boolean
  showReviewComments: boolean
  chatPanelWidth: number | null
  groupAsideWidth: number | null
  groupSidebarWidth: number | null
}

/** The versioned config document stored encrypted behind one GitHub user. */
export interface UserConfig {
  version: 1
  settings: {
    llm: LlmSettings
    locale: Locale
  }
  preferences: UserPreferences
}

export const USER_CONFIG_VERSION = 1

export const defaultUserPreferences: UserPreferences = {
  dark: false,
  syntaxTheme: { light: 'pierre-light', dark: 'pierre-dark' },
  layout: 'split',
  fileListLayout: 'tree',
  groupNav: 'tabs',
  wrapLines: true,
  smoothScroll: true,
  autoRefresh: false,
  autoFetchFullFile: false,
  showReviewComments: true,
  chatPanelWidth: null,
  groupAsideWidth: null,
  groupSidebarWidth: null,
}

export function defaultUserConfig(locale: Locale = DEFAULT_LOCALE): UserConfig {
  return {
    version: USER_CONFIG_VERSION,
    settings: {
      llm: { ...defaultLlmSettings },
      locale,
    },
    preferences: {
      ...defaultUserPreferences,
      syntaxTheme: { ...defaultUserPreferences.syntaxTheme },
    },
  }
}

const MAX_STRING_LENGTH = 8192

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length <= MAX_STRING_LENGTH ? value : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function widthValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000 ? value : null
}

/** Normalize untrusted LLM settings; unknown providers fall back to the key-derived provider. */
export function sanitizeLlmSettings(value: unknown): LlmSettings {
  const input = asRecord(value) ?? {}
  const llm: LlmSettings = {
    provider: defaultLlmSettings.provider,
    gatewayToken: stringValue(input.gatewayToken, ''),
    gatewayModel: stringValue(input.gatewayModel, defaultLlmSettings.gatewayModel),
    anthropicApiKey: stringValue(input.anthropicApiKey, ''),
    anthropicModel: stringValue(input.anthropicModel, defaultLlmSettings.anthropicModel),
    openaiApiKey: stringValue(input.openaiApiKey, ''),
    openaiBaseUrl: stringValue(input.openaiBaseUrl, defaultLlmSettings.openaiBaseUrl),
    openaiModel: stringValue(input.openaiModel, defaultLlmSettings.openaiModel),
  }
  llm.provider = typeof input.provider === 'string' && isLlmProvider(input.provider)
    ? input.provider
    : deriveProvider(llm)
  return llm
}

function sanitizePreferences(value: unknown): UserPreferences {
  const input = asRecord(value) ?? {}
  const syntaxTheme = asRecord(input.syntaxTheme) ?? {}
  return {
    dark: booleanValue(input.dark, defaultUserPreferences.dark),
    syntaxTheme: {
      light: stringValue(syntaxTheme.light, defaultUserPreferences.syntaxTheme.light),
      dark: stringValue(syntaxTheme.dark, defaultUserPreferences.syntaxTheme.dark),
    },
    layout: input.layout === 'unified' ? 'unified' : 'split',
    fileListLayout: input.fileListLayout === 'list' ? 'list' : 'tree',
    groupNav: input.groupNav === 'sidebar' ? 'sidebar' : 'tabs',
    wrapLines: booleanValue(input.wrapLines, defaultUserPreferences.wrapLines),
    smoothScroll: booleanValue(input.smoothScroll, defaultUserPreferences.smoothScroll),
    autoRefresh: booleanValue(input.autoRefresh, defaultUserPreferences.autoRefresh),
    autoFetchFullFile: booleanValue(input.autoFetchFullFile, defaultUserPreferences.autoFetchFullFile),
    showReviewComments: booleanValue(input.showReviewComments, defaultUserPreferences.showReviewComments),
    chatPanelWidth: widthValue(input.chatPanelWidth),
    groupAsideWidth: widthValue(input.groupAsideWidth),
    groupSidebarWidth: widthValue(input.groupSidebarWidth),
  }
}

/**
 * Normalize untrusted input into the current config document. Unknown fields
 * are dropped deliberately: in particular, a GitHub PAT is never accepted into
 * cloud config because the GitHub App session supplies GitHub access.
 */
export function sanitizeUserConfig(value: unknown): UserConfig | null {
  const input = asRecord(value)
  if (!input || input.version !== USER_CONFIG_VERSION)
    return null
  const settings = asRecord(input.settings)
  if (!settings)
    return null
  return {
    version: USER_CONFIG_VERSION,
    settings: {
      llm: sanitizeLlmSettings(settings.llm),
      locale: isLocale(settings.locale) ? settings.locale : DEFAULT_LOCALE,
    },
    preferences: sanitizePreferences(input.preferences),
  }
}

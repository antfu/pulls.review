import type { AnalyzeProgress } from '@pulls.review/core/types'
import { Diagnostic } from 'nostics'
import { t } from './index'

/** Core diagnostics the UI has a translation for, by code. */
const DIAGNOSTIC_KEYS = {
  llmNotConfigured: 'analyze.notConfigured',
  agentSessionLost: 'analyze.agentSessionLost',
  tokenRejected: 'errors.tokenRejected',
  commentTooLarge: 'errors.tooLarge',
} as const

function isTranslated(name: string): name is keyof typeof DIAGNOSTIC_KEYS {
  return name in DIAGNOSTIC_KEYS
}

/** The error to show for anything core threw: a translated diagnostic where one exists, the message otherwise. */
export function localizeError(error: unknown): Error {
  if (error instanceof Diagnostic && isTranslated(error.name))
    return new Error(t(DIAGNOSTIC_KEYS[error.name], error.data ?? {}))
  return error instanceof Error ? error : new Error(String(error))
}

/** What the analysis is doing right now, in the UI language. */
export function describeProgress(progress: AnalyzeProgress): string {
  switch (progress.kind) {
    case 'thinking':
      return t('analyze.thinking', { step: progress.step })
    case 'reading': {
      const more = progress.paths.length > 1 ? ', …' : ''
      return t('analyze.reading', { n: progress.paths.length, first: `${progress.paths[0] ?? ''}${more}` }, progress.paths.length)
    }
    case 'organizing':
      return t('analyze.organizing')
  }
}

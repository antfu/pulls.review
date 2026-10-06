import type { LlmChatInput, LlmRunner } from './llm-runner'
import { resolveModel } from '@pulls.review/core/analyze'
import { diagnostics } from '@pulls.review/core/diagnostics'
import { settings } from '../state/settings'

export const NOT_COMPILED_MESSAGE = 'llm adapter is not compiled into this build (PR_LLM is off)'

function resolveConfiguredModel() {
  const resolved = resolveModel(settings.value.llm)
  if (!resolved)
    throw diagnostics.llmNotConfigured()
  return resolved
}

// `import.meta.env.PR_LLM` is a compile-time literal: with it off, the `throw` right before each
// `import()` makes the import dead code, so the embed bundle never discovers the pi runtime.
// The check must sit in the same function as the import for the bundler to see that.

async function chat({ diff, session, text, signal, onMessages, onGroupingUpdate }: LlmChatInput) {
  if (!import.meta.env.PR_LLM)
    throw new Error(NOT_COMPILED_MESSAGE)
  const resolved = resolveConfiguredModel()
  const { createChatSession } = await import('@pulls.review/core/llm')
  if (signal.aborted)
    return session.messages
  const agent = createChatSession({ diff, resolved, locale: settings.value.locale, messages: session.messages, onGroupingUpdate })
  const sync = () => {
    const { streamingMessage } = agent.state
    onMessages(streamingMessage ? [...agent.state.messages, streamingMessage] : [...agent.state.messages])
  }
  const unsubscribe = agent.subscribe(sync)
  const onAbort = () => agent.abort()
  signal.addEventListener('abort', onAbort)
  try {
    sync()
    await (text === undefined ? agent.continue() : agent.prompt(text))
  }
  finally {
    unsubscribe()
    signal.removeEventListener('abort', onAbort)
  }
  return [...agent.state.messages]
}

/** Runs core's pi loop in this browser, with the model and language from Settings. */
export const browserLlmRunner: LlmRunner = {
  isSetup: () => import.meta.env.PR_LLM && resolveModel(settings.value.llm) !== undefined,
  async analyze(diff, options) {
    if (!import.meta.env.PR_LLM)
      throw new Error(NOT_COMPILED_MESSAGE)
    const resolved = resolveConfiguredModel()
    // Read once per run so a mid-run settings change can't split the prompt and the stamp.
    const locale = settings.value.locale
    const { runLlmAnalysis } = await import('@pulls.review/core/llm')
    return runLlmAnalysis(diff, resolved, locale, options)
  },
  chat,
}

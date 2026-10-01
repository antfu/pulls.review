import type { AnalyzeAdapter } from '@pulls.review/core/types'

/**
 * TODO(phase: web-llm-integration): fully in-browser model (e.g. WebGPU/WASM local
 * inference, no API key or network call needed at analyze time). available = true
 * once a local model has been downloaded/loaded. Stub for now:
 */
export const webLlmAdapter: AnalyzeAdapter = {
  id: 'web-llm',
  available: false,
  analyze: () => { throw new Error('web-llm adapter not implemented yet') },
}

import { fileURLToPath } from 'node:url'

export const alias = [
  {
    find: /^shiki\/wasm$/,
    replacement: fileURLToPath(new URL('./app/embed/shiki-wasm-noop.ts', import.meta.url)),
  },
  {
    find: /^shiki$/,
    replacement: fileURLToPath(new URL('./app/embed/shiki-langs-embed.ts', import.meta.url)),
  },
]

/**
 * Compile-time feature flags, read as `import.meta.env.PR_*` (typed in `app/types/env.d.ts`).
 * Each is replaced with a literal at build time, so a branch on it is dead-code-eliminated
 * before module discovery - a dynamic `import()` inside a disabled branch is never bundled.
 */
export function features(flags: { llm: boolean, embed: boolean }) {
  return {
    'import.meta.env.PR_LLM': JSON.stringify(flags.llm),
    'import.meta.env.PR_EMBED': JSON.stringify(flags.embed),
  }
}

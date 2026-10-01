import { fileURLToPath } from 'node:url'

/** `@pulls.review/core` resolves to its source so the app needs no core build step. */
export const coreAlias = [
  {
    find: /^@pulls\.review\/core$/,
    replacement: fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
  },
  {
    find: /^@pulls\.review\/core\/llm$/,
    replacement: fileURLToPath(new URL('../core/src/llm.ts', import.meta.url)),
  },
]

export const alias = [
  ...coreAlias,
  {
    find: /^shiki\/wasm$/,
    replacement: fileURLToPath(new URL('./src/embed/shiki-wasm-noop.ts', import.meta.url)),
  },
  {
    find: /^shiki$/,
    replacement: fileURLToPath(new URL('./src/embed/shiki-langs-embed.ts', import.meta.url)),
  },
]

/**
 * Compile-time feature flags, read as `import.meta.env.PR_*` (typed in `src/types/env.d.ts`).
 * Each is replaced with a literal at build time, so a branch on it is dead-code-eliminated
 * before module discovery - a dynamic `import()` inside a disabled branch is never bundled.
 */
export function features(flags: { llm: boolean, embed: boolean }) {
  return {
    'import.meta.env.PR_LLM': JSON.stringify(flags.llm),
    'import.meta.env.PR_EMBED': JSON.stringify(flags.embed),
  }
}

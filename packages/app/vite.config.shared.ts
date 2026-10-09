import { fileURLToPath } from 'node:url'
import VueRouter from 'vue-router/vite'

/** `@pulls.review/core/*` resolves to its source entries so the app needs no core build step. */
export const coreAlias = [
  {
    find: /^@pulls\.review\/core\/(.+)$/,
    replacement: `${fileURLToPath(new URL('../core/src/', import.meta.url))}$1.ts`,
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
export function features(flags: { llm: boolean, embed: boolean, local?: boolean }) {
  return {
    'import.meta.env.PR_LLM': JSON.stringify(flags.llm),
    'import.meta.env.PR_EMBED': JSON.stringify(flags.embed),
    'import.meta.env.PR_LOCAL': JSON.stringify(flags.local ?? false),
  }
}

/** Both builds select their complete route tree before the app starts. */
export function fileRouter(local = false, watch = true) {
  const path = (value: string) => fileURLToPath(new URL(value, import.meta.url))
  return VueRouter({
    root: path('../..'),
    watch,
    routesFolder: local
      ? [{ src: path('src/pages-web'), exclude: [path('src/pages-web/index.vue')] }, path('src/pages-local')]
      : path('src/pages-web'),
    dts: path(local ? 'typed-router.local.d.ts' : 'typed-router.d.ts'),
    experimental: { paramParsers: { dir: path('src/params') } },
  })
}

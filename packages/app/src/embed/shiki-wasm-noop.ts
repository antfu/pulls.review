/**
 * Aliased over the `shiki/wasm` specifier for the embed build only (see
 * vite.config.embed.ts). `@pierre/diffs`'s shared highlighter only reaches for this
 * when `preferredHighlighter === 'shiki-wasm'` (see `shiki-langs-embed.ts` - this app
 * never asks for that engine, always the plain JS regex one), so the real module -
 * shiki's oniguruma WASM engine plus its `.wasm` binary - is dead weight: never
 * actually loaded at runtime, but still a `import("shiki/wasm")` call site a bundler
 * building a single self-contained file (`inlineDynamicImports: true`) discovers and
 * inlines regardless of whether that branch ever runs.
 */
export default undefined

import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { createJiti } from 'jiti'
import { defineConfig } from 'vite'
import { features, alias as sharedAlias } from './vite.config.shared'

const jiti = createJiti(import.meta.url)

/**
 * Packages that MUST NOT end up in the embed: github.com's CSP blocks model providers,
 * so LLM analysis/chat is compiled out (`PR_LLM: false`) and these would be dead weight.
 */
const FORBIDDEN_MODULES = /\/node_modules\/(?:@earendil-works\/pi-[^/]+|@ai-sdk\/[^/]+|ai|@anthropic-ai\/sdk|openai)\//

/**
 * Separate build target from `vite.config.ts`: a single self-contained IIFE bundle
 * defining the `<pulls-review-embed-panel>` custom element, for the userscript to `@require`.
 * See `app/embed/main.ts`. No `unocss/vite` plugin - its CSS is a pre-generated,
 * shadow-root-safe file instead (`build:embed:css`, see scripts/build-embed-css.ts).
 *
 * `inlineDynamicImports: true` (required so the userscript's single `@require` has no
 * further script-src fetches to make on GitHub's CSP) forces the bundler to inline every
 * dynamic import it can statically discover regardless of whether a given runtime path
 * actually reaches it, so anything unused here has to be cut before bundling, not after:
 * - The Shiki aliases (`vite.config.shared.ts`) swap out the WASM highlighter engine and
 *   most of shiki's ~240 language grammars.
 * - `PR_LLM: false` compiles out the branches holding the `import()`s of the pi runtime
 *   and `@ai-sdk/gateway`; `generateBundle` below fails the build if any still slips in.
 * Neither applies to the main site, which code-splits each into its own lazily-fetched chunk.
 */
export default defineConfig({
  plugins: [
    Vue(),
    {
      name: 'embed-plugin',
      async buildStart() {
        await (jiti.import('./scripts/build-embed-css') as Promise<typeof import('./scripts/build-embed-css')>)
          .then(m => m.buildEmbedCSS())
      },
      generateBundle(_, bundle) {
        const forbidden = Object.values(bundle)
          .flatMap(chunk => chunk.type === 'chunk' ? chunk.moduleIds : [])
          .filter(id => FORBIDDEN_MODULES.test(id))
        if (forbidden.length)
          throw new Error(`embed bundle must not ship LLM SDKs, found:\n${forbidden.join('\n')}`)
      },
      async buildEnd() {
        await (jiti.import('./scripts/build-userscript') as Promise<typeof import('./scripts/build-userscript')>)
          .then(m => m.buildUserscript())
      },
    },
  ],
  resolve: {
    alias: sharedAlias,
  },
  define: features({ llm: false, embed: true }),
  publicDir: false,
  build: {
    outDir: 'public/embed',
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./app/embed/main.ts', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'diffs-embed.js',
        inlineDynamicImports: true,
      },
    },
  },
})

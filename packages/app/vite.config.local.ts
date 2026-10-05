import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { LOCAL_BASE_PATH } from '../core/src/local-rpc'
import { alias, features } from './vite.config.shared'

/**
 * The `pulls.review` CLI's SPA (Plan 09): the site with `PR_LOCAL` on, served by its
 * devframe server at the same mount path standalone and in a hub, so assets and the
 * router share one absolute base. Built into the CLI package, next to its server.
 */
export default defineConfig({
  base: LOCAL_BASE_PATH,
  plugins: [
    Vue(),
    UnoCSS(),
  ],
  resolve: {
    alias,
  },
  define: features({ llm: true, embed: false, local: true }),
  build: {
    outDir: fileURLToPath(new URL('../cli/dist/client', import.meta.url)),
    emptyOutDir: true,
  },
})

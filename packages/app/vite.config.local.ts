import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { LOCAL_HUB_BASE_PATH } from '../core/src/local-rpc'
import { alias, features, fileRouter } from './vite.config.shared'

/**
 * One bundle serves at `/` standalone and at the hub's mount path, so its base is
 * decided in the page: before any asset loads, a `<base>` names the mount path, and
 * relative asset URLs, the router and devframe's connection lookup all resolve from it.
 * A deep link (`/compare/a...b`) reloads fine, as the base never follows the route.
 */
function runtimeBase(): Plugin {
  const script = `document.write('<base href="' + (location.pathname.startsWith(${JSON.stringify(LOCAL_HUB_BASE_PATH)}) ? ${JSON.stringify(LOCAL_HUB_BASE_PATH)} : '/') + '">')`
  return {
    name: 'pulls-review:runtime-base',
    transformIndexHtml: html => html.replace('<head>', `<head>\n    <script>${script}</script>`),
  }
}

/**
 * The `pulls.review` CLI's SPA (Plan 09): the site with `PR_LOCAL` on, served by its
 * devframe server. Built into the CLI package, next to its server.
 */
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    runtimeBase(),
    fileRouter(true, command === 'serve'),
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
}))

import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './source-routes'

export const router = createRouter({
  // The `PR_LOCAL` build names its mount path in a `<base>` (see `vite.config.local.ts`).
  history: createWebHistory(import.meta.env.PR_LOCAL ? new URL(document.baseURI).pathname : undefined),
  routes: [
    { name: 'home', path: '/', component: () => import('./pages-web/index.vue') },
    { path: '/upload', component: () => import('./pages-web/upload.vue') },
    { path: '/gh/:owner/:repo', component: () => import('./pages-web/gh/[owner]/[repo]/index.vue') },
    ...routes(() => import('./pages-web/gh/[owner]/[repo]/diff.vue')),
  ],
})

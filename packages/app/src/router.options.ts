import type { RouterConfig } from '@nuxt/schema'
import { routes } from './source-routes'

export default {
  routes: () => [
    { name: 'home', path: '/', component: () => import('./pages-web/index.vue') },
    { name: 'inbox', path: '/inbox', component: () => import('./pages-web/inbox.vue') },
    { path: '/upload', component: () => import('./pages-web/upload.vue') },
    { path: '/gh/:owner/:repo', component: () => import('./pages-web/gh/[owner]/[repo]/index.vue') },
    ...routes(() => import('./pages-web/gh/[owner]/[repo]/diff.vue')),
  ],
} satisfies RouterConfig

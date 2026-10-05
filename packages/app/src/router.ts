import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './source-routes'

export const router = createRouter({
  // `BASE_URL` is `/` on the site and the devframe mount path in the `PR_LOCAL` build.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { name: 'home', path: '/', component: () => import('./pages/index.vue') },
    { path: '/upload', component: () => import('./pages/upload.vue') },
    { path: '/gh/:owner/:repo', component: () => import('./pages/gh/[owner]/[repo]/index.vue') },
    ...routes(() => import('./pages/gh/[owner]/[repo]/diff.vue')),
  ],
})

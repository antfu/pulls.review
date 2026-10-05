import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './source-routes'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/index.vue') },
    { path: '/upload', component: () => import('./pages/upload.vue') },
    { path: '/gh/:owner/:repo', component: () => import('./pages/gh/[owner]/[repo]/index.vue') },
    ...routes(() => import('./pages/gh/[owner]/[repo]/diff.vue')),
  ],
})

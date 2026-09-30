import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/index.vue') },
    { path: '/upload', component: () => import('./pages/upload.vue') },
    { path: '/gh/:owner/:repo', component: () => import('./pages/gh/[owner]/[repo]/index.vue') },
    { path: '/gh/:owner/:repo/:number', component: () => import('./pages/gh/[owner]/[repo]/[number].vue') },
  ],
})

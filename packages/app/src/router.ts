import { createWebHistory } from 'vue-router'
import { handleHotUpdate, resolver } from 'vue-router/auto-resolver'
import { experimental_createRouter as createRouter } from 'vue-router/experimental'

export const router = createRouter({
  history: createWebHistory(import.meta.env.PR_LOCAL ? new URL(document.baseURI).pathname : undefined),
  resolver,
})

if (import.meta.hot)
  handleHotUpdate(router)

declare module 'vue-router' {
  interface TypesConfig {
    Router: typeof router
  }
}

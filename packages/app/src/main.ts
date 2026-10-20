import { createApp } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { installAppContext } from './app-context'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles'

async function start() {
  const app = createApp(App).use(i18n)
  // The flag is a compile-time literal: the site build never bundles the devframe client.
  if (import.meta.env.PR_LOCAL)
    await import('./local/install').then(({ installLocal }) => installLocal(app))
  else
    installAppContext(app)
  app.component('RouterLink', RouterLink)
  app.component('RouterView', RouterView)
  app.use(router).mount('#app')
}

void start()

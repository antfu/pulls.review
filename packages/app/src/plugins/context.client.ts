import { defineNuxtPlugin } from '#app'
import { installAppContext } from '../app-context'
import { initializeGithubSession } from '../auth/github-oauth'
import { ensureUserConfigSync } from '../auth/user-config-sync'
import { i18n } from '../i18n'

export default defineNuxtPlugin((nuxtApp) => {
  initializeGithubSession()
  nuxtApp.vueApp.use(i18n)
  installAppContext(nuxtApp.vueApp)
  void ensureUserConfigSync()
})

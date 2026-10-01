import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles'

createApp(App)
  .use(router)
  .use(i18n)
  .mount('#app')

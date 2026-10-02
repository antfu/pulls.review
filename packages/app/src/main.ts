import { createApp } from 'vue'
import { installAppContext } from './app-context'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles'

const app = createApp(App)
  .use(router)
  .use(i18n)
installAppContext(app)
app.mount('#app')

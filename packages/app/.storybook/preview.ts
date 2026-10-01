import type { Preview } from '@storybook/vue3-vite'
import { setup } from '@storybook/vue3-vite'
import { i18n } from '../src/i18n'
import '../src/styles'

// `<RouterLink>` needs a real vue-router instance; stub it as a plain `<a>` so
// components that use it (AppHeader) render outside a router context.
setup((app) => {
  app.use(i18n)
  app.component('RouterLink', {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  })
})

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview

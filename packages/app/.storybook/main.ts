import type { StorybookConfig } from '@storybook/vue3-vite'
import UnoCSS from 'unocss/vite'

const config: StorybookConfig = {
  stories: ['../src/components/**/*.stories.ts'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  async viteFinal(config) {
    config.plugins ??= []
    // @storybook/vue3-vite already wires up @vitejs/plugin-vue itself - pushing a
    // second instance (the old workaround here, for storybookjs/storybook#28968,
    // #20576, #26306) now double-transforms every SFC and breaks the build ("At least
    // one <template> or <script> is required"). Only UnoCSS still needs adding by hand.
    config.plugins.push(UnoCSS())
    return config
  },
}

export default config

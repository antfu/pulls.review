import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias, features, fileRouter } from './vite.config.shared'

export default defineConfig(({ command }) => ({
  plugins: [
    fileRouter(false, command === 'serve'),
    Vue(),
    UnoCSS(),
  ],
  resolve: {
    alias,
  },
  define: features({ llm: true, embed: false }),
}))

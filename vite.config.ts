import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias, features } from './vite.config.shared'

export default defineConfig({
  plugins: [
    Vue(),
    UnoCSS(),
  ],
  resolve: {
    alias,
  },
  define: features({ llm: true }),
})

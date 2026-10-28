import { defineNuxtConfig } from 'nuxt/config'
import { alias, features } from './vite.config.shared'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-28',
  srcDir: 'src',
  ssr: false,
  pages: true,
  devtools: { enabled: false },
  telemetry: false,
  imports: { autoImport: false, scan: false },
  components: [],
  modules: ['@unocss/nuxt'],
  css: [
    '@unocss/reset/tailwind.css',
    '@antfu/design/styles.css',
    'vue-afloat/style.css',
    '~/main.css',
  ],
  app: {
    head: {
      title: 'Pull reviews made clear and organized - Diffwise',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'A better way to review a GitHub pull request’s diff: grouped, summarized, and fast.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Diffwise' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  vite: {
    resolve: { alias },
    define: features({ llm: true, embed: false }),
  },
  nitro: {
    preset: 'node-server',
    imports: false,
  },
})

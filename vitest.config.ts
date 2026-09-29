import { defineConfig } from 'vitest/config'
import { features } from './vite.config.shared'

export default defineConfig({
  define: features({ llm: true }),
  test: {
    environment: 'happy-dom',
  },
})

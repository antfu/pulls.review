import { defineConfig } from 'skills-npm'

export default defineConfig({
  // Skills ship with the packages' dependencies (e.g. `@antfu/design` in packages/app), not the root's.
  recursive: true,
})

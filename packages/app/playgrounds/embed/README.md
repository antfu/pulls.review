# Embedded playground

Loads the built `<pulls-review-embed-panel>` custom element directly (no GitHub page, no
userscript manager) for quick manual testing of the embed build.

```bash
pnpm run build:embed      # writes public/embed/diffs-embed.js
pnpm run playground:embedded   # vite dev, opened at /playgrounds/embedded/
```

The custom element takes no attributes - it reads `location.pathname` and
`document.documentElement.dataset.colorMode` itself, the same as it does on a real
GitHub page (see `app/embed/EmbedApp.ce.vue`). So this page mounts it exactly like the
userscript does, and:

- The owner/repo/PR# inputs + "Navigate" button push a matching `/owner/repo/pull/n`
  path via `history.pushState` and re-render part of the page - like GitHub's own
  React pages do, with no navigation event. The component notices the path change
  from the DOM mutation and remounts the PR view; "Leave PR" pushes the `/pulls` list
  path, which closes the drawer.
- "Toggle host dark mode" flips `dataset.colorMode` and remounts (dark mode is seeded
  once, at mount, matching real usage - GitHub's theme doesn't change mid-session).

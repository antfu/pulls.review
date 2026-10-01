interface ImportMetaEnv {
  /**
   * Whether LLM analysis and chat are compiled in. `false` in the embed build, so the
   * pi runtime and `@ai-sdk/gateway` are never bundled there. See `features()` in
   * `vite.config.shared.ts`. Test for truthiness only: Vitest exposes defines through
   * `process.env`, where this is the string `'true'` (and `vi.stubEnv('PR_LLM', undefined)`
   * turns it off).
   */
  readonly PR_LLM: boolean
  /**
   * Whether this is the github.com embed build (`true` only in `vite.config.embed.ts`).
   * Guards SPA-only behaviour that must never touch the host page - e.g. `useDocumentTitle`
   * skips writing the tab title so the embed never hijacks github.com's `<title>`. Same
   * truthiness-only testing rule as `PR_LLM`.
   */
  readonly PR_EMBED: boolean
}

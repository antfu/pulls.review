interface ImportMetaEnv {
  /**
   * Whether LLM analysis and chat are compiled in. `false` in the embed build, so the
   * pi runtime and `@ai-sdk/gateway` are never bundled there. See `features()` in
   * `vite.config.shared.ts`. Test for truthiness only: Vitest exposes defines through
   * `process.env`, where this is the string `'true'` (and `vi.stubEnv('PR_LLM', undefined)`
   * turns it off).
   */
  readonly PR_LLM: boolean
}

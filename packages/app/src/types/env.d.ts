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
  /**
   * Whether this is the `pulls.review` CLI's build (`vite.config.local.ts`), served by its
   * devframe server: the cache and GitHub token come over RPC, and `/local` reviews a
   * local git diff. Same truthiness-only testing rule as `PR_LLM`.
   */
  readonly PR_LOCAL: boolean
  /**
   * The GitLab instance this build opens merge requests from, as a host with an optional
   * port (`gitlab.example.com`); `gitlab.com` unless the build set `PR_GITLAB_HOST`.
   */
  readonly PR_GITLAB_HOST: string
  /** Short git sha the embed bundle was built from; only defined by `vite.config.embed.ts`. */
  readonly PR_EMBED_SHA: string | undefined
}

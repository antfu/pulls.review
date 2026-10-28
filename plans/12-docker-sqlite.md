# Plan 12: Self-host with Docker, SQLite, and Drizzle

Status: **IMPLEMENTED: Nuxt, Docker and SQLite; live cutover pending**, 2026-10-28. Effort: L. Migration risk: high around job delivery and production data. Implementation is verified locally; production routing and data have not been changed.

Original planning baseline: HEAD `2a4f759` plus the existing uncommitted GitHub App backend. HEAD alone did not describe that baseline. The migration builds on that work; unrelated changes are preserved. This plan follows the existing phase-plan numbering; it does not supersede plans 01–11.

## Implementation update

The user selected a full Nuxt migration. `packages/app` now uses Nuxt for the
application and HTTP layer, with `packages/server` holding reusable backend
services and Drizzle persistence. The original Nitro-only recommendation below
is superseded. Verification and operational documentation are complete. Evidence: 546 Vitest
tests pass, typechecking/lint pass, Nuxt and Docker builds succeed, the migration
rehearsal passes, and container smoke checks cover HTTP/OAuth/webhooks, persistent
storage and backup/restore. Browser checks cover the homepage, inbox and pasted
review flow. A subprocess kill test verifies job recovery. The implementation
and runbook live in `packages/server/README.md`; live production cutover remains
an operator action because no target host or routing change was requested.

## Original planning decision (superseded by Nuxt selection)

Use one Docker image containing the existing Vite/Vue SPA, a Nitro Node server, and a durable SQLite analysis runner. Use Drizzle ORM with `better-sqlite3` and checked-in SQL migrations. Start with one application container, one runner loop, concurrency one, and one persistent local disk volume at `/data`.

Keep `packages/app` and its independent embed build. Add `packages/server` for the Node backend. Preserve `packages/core` as runtime-independent code. Docker becomes the intended deployment target; keep the old deployment available during migration and the rollback window, without committing to permanent support for two backends.

Nuxt is optional and deferred. It can provide the full-stack project structure, but replacing the existing Vite entry, router, context setup, and embed integration is not necessary to host this application. Nitro supplies the Node backend without that frontend migration. If Nuxt later becomes a deliberate product choice, start with client rendering (`ssr: false`), preserve explicit imports, and keep the userscript build separate. SSR is not a prerequisite for this migration.

This is a portability and predictable-capacity plan, not a demonstrated cost saving. No production billing or traffic data was inspected. Compare current Workers CPU/requests, D1, KV, and Queue charges with VM, disk, backup, bandwidth, and maintenance costs. Provider LLM charges remain regardless of hosting. Measure queue wait time, CPU, memory, database size, and disk writes before choosing host size.

## Current state and contracts

| Source                                               | Migration relevance                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `wrangler.jsonc`                                     | Static SPA assets, D1 `DB`, KV `INSTALLATIONS`, Queue `ANALYSIS_QUEUE`, two retries, dead-letter queue, 300,000 ms CPU ceiling |
| `packages/worker/src/index.ts`                       | Web-standard request/response handlers plus Cloudflare queue entry point                                                       |
| `packages/worker/src/env.ts`                         | Secrets and Cloudflare binding types are mixed in `Env`                                                                        |
| `packages/worker/migrations/0001_…0007_*.sql`        | Nine application tables, existing unique/partial indexes, encrypted settings and stored analysis                               |
| `packages/worker/src/installations.ts`               | Installation metadata duplicated in KV and D1; listing currently reads KV                                                      |
| `packages/worker/src/analysis-jobs.ts`               | Durable job/attempt ledger; existing repository seam; current start operation is not a leased atomic claim                     |
| `packages/worker/src/analyze.ts`                     | Model selection, analysis, lifecycle updates, queue retry policy                                                               |
| `packages/worker/src/webhook.ts`, `github-routes.ts` | Queue sends and `waitUntil` fallback; webhook delivery delay is 10 seconds                                                     |
| `packages/worker/src/session.ts`, `user-config.ts`   | AES-GCM formats and encryption-key derivation must survive cutover                                                             |
| `packages/app/package.json`                          | Separate embed build precedes site build                                                                                       |
| `.github/workflows/ci.yml`                           | Existing lint/typecheck jobs; add server tests and image smoke checks                                                          |

Representative current code:

```text
// packages/worker/src/index.ts
async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>
async queue(batch: MessageBatch<AnalysisJob>, env: Env): Promise<void>

// packages/worker/src/analysis-jobs.ts
export function createD1AnalysisJobsRepository(db: D1Database): AnalysisJobsRepository

// packages/worker/src/analyze.ts
const finalAttempt = message.attempts >= 3
message.retry({ delaySeconds: Math.min(300, 30 * 2 ** Math.max(0, message.attempts - 1)) })
```

Preserve endpoint paths, payloads, status codes, OAuth cookies and refresh behavior, CSRF/origin checks, webhook HMAC verification, GitHub authorization for private data, optimistic config concurrency, opt-in automation, key-source precedence, monthly run budgets, exclusion rules, prompt/model stamps, and neutral check runs. The implementation is authoritative where README prose differs: the root README still describes automatic comments, while current code stores results and supports opt-in automation. Update this documentation during migration.

The browser must never receive readable GitHub OAuth credentials. Better Auth stores encrypted GitHub tokens in SQLite and uses opaque HttpOnly session cookies. Existing sealed-cookie sessions require sign-in again; public Nuxt runtime config must never contain tokens. Preserve the exact encryption secret and derivation for existing configuration ciphertext. Existing browser caches and review state remain browser-local.

Match explicit imports, TypeScript, and colocated Vitest tests. `packages/worker/src/http.ts` exemplifies small Web API helpers. `analysis-jobs.test.ts`, `analyze.test.ts`, and `user-config.test.ts` are behavior references. If UI changes become necessary, first check `@antfu/design`; Vue SFCs must use template UnoCSS utilities, with no style blocks.

## Target mapping

| Cloudflare facility           | Docker replacement                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Worker fetch handler          | Nitro Node adapter with the same `/api/*` routes                                          |
| Static Assets                 | Built `packages/app/dist`, immutable hashed assets, SPA fallback for frontend routes only |
| D1                            | `/data/pulls-review.sqlite`, Drizzle repositories                                         |
| Installation KV               | Existing `github_installation` table, reconciled at import                                |
| Queue and dead-letter queue   | `analysis_job` scheduling/leases; terminal failed jobs retained for diagnosis             |
| `waitUntil` analysis fallback | Persist job before response; background runner consumes committed rows                    |
| Wrangler secrets              | Runtime environment or mounted secrets, excluded from image/build context                 |

Suggested server layout: `src/http/`, `src/services/`, `src/db/schema.ts`, `src/db/repositories/`, `src/jobs/runner.ts`, `src/config.ts`, and `migrations/`. Keep business functions independent of Nitro event objects. Adapt HTTP once at the edge; do not emulate the D1 API throughout the new server. Native driver dependencies must be present in the final image.

SQLite uses WAL, foreign-key enforcement on every connection, a bounded busy timeout, and short transactions. Start with durable synchronization settings and benchmark before relaxing them. Never hold a transaction across GitHub or LLM calls. SQLite permits one writer at a time; the volume must be local to one host, not a shared network filesystem. Multiple hosts or sustained writer contention are triggers to reassess PostgreSQL, not to share the SQLite file.

## Scope

Implementation may add `packages/server/**`, `Dockerfile`, `.dockerignore`, `compose.yaml`, migration/backup/smoke scripts under `scripts/`, and a deployment runbook. It may change package manifests, workspace catalog/lockfile, root scripts, CI, worker/server boundaries, app dev proxy config, README, `.agents/00-goal.md`, and `.agents/01-architecture.md` to reflect deployment changes.

Do not redesign the UI, change analysis prompts, resurrect the CLI, change public API shapes, move browser caches into SQL, add Redis/Postgres, or change the existing deployment while developing the replacement. No deployment, DNS switch, secret rotation, or deletion of Cloudflare resources is authorized by this planning request.

## Ordered implementation

### 1. Establish the backend boundary and regression baseline

Inventory every handler in `packages/worker/src/index.ts` and its dependencies. Separate configuration, repositories, and job scheduling from Cloudflare bindings. Reuse business logic through a shared internal backend module where useful while the Worker remains operational; avoid maintaining two divergent copies of authorization and model-selection logic. Keep Cloudflare-specific adapters under `packages/worker`.

Add `@pulls.review/server` with build, dev, typecheck, and test scripts. Prove a Nitro handler can preserve request URL, raw body bytes, multiple Set-Cookie headers, responses and streaming GitHub proxy bodies. Keep public-origin configuration explicit behind the TLS proxy; do not trust arbitrary forwarded host headers. Unknown `/api/*` must remain an API 404, not receive SPA HTML. Preserve API-before-assets routing, especially the webhook path under `/api/github/*`.

Verify baseline with `pnpm test`, `pnpm -F @pulls.review/app run build:embed`, `pnpm typecheck`, and `pnpm lint`. Record existing failures rather than attributing them to this change. After adding the server, `pnpm -F @pulls.review/server test` must pass route, cookie, raw-webhook-body, proxy, and deep-link tests.

### 2. Add SQLite and Drizzle repositories

Model `user_config`, `analysis_result`, `github_installation`, `github_repository`, `analysis_job`, `analysis_attempt`, `automation_config`, `automation_usage`, and `analysis_feedback` in Drizzle. Preserve names, nullability, integer timestamp units, IDs, NOCASE collations, conflict targets, and the partial unique active-head index. Use reviewed SQL where Drizzle cannot express an existing constraint faithfully.

Keep historical migration files intact. Establish a Drizzle baseline equivalent to the schema after all seven existing migrations. Provide two explicit paths: fresh database creation from that baseline, and import into an empty database followed by schema verification and baseline adoption. Do not run table-creation migrations against imported tables or merely mark an unverified schema as migrated. Subsequent changes are ordered, checked-in migrations; never use schema push in production.

Replace KV reads with SQL installation reads. Import/reconcile KV-only records without reviving deleted or suspended installations. Paginate the migration inventory; do not inherit the existing 100-record listing limit. Preserve encrypted blobs byte-for-byte and validate decryption without printing contents.

Implement `pnpm -F @pulls.review/server db:migrate`. Run migrations once before serving requests or claiming jobs; a migration failure prevents readiness. Add `src/db/migrations.test.ts` and repository integration tests using real temporary SQLite files. Verify with `pnpm -F @pulls.review/server test`: fresh initialization, repeated migration, imported fixture adoption, matching schema/indexes, case-insensitive uniqueness, config conflict handling, result/feedback IDs, and encrypted-config roundtrip all pass.

### 3. Replace queue delivery with durable scheduling

Extend `analysis_job` with scheduling and lease fields (for example `available_at`, `lease_token`, `lease_expires_at`). Keep public status responses stable. In a short transaction, deduplicate delivery/head, supersede obsolete queued work, enforce/reserve any automation budget, and create the job. Only increment budget for a newly created job. Return success only after commit; database failure must produce a retryable response.

The runner polls indexed eligible rows, atomically claims one with a fresh lease token, and creates its attempt in the same transaction. Refactor `beginTrackedJob` so executing a claimed job does not start/count it a second time. Run network/model calls outside the transaction. Refresh the lease during long analyses and gate every result write and completion update on the current token. Losing a lease cancels work where supported and prevents stale writes.

Preserve webhook delay (10 seconds), three total attempts, existing transient/permanent error classification, and retry backoff. Expired leases are recovered with bounded retries and recorded failed attempts. Commit stored result plus successful job/attempt state together. Failed terminal jobs remain queryable; a future explicit retry creates auditable new work rather than silently looping forever. Check-run publication remains best effort.

On shutdown stop claiming, allow bounded graceful completion, then leave unfinished leases for recovery. Never replace the queue with an untracked promise or timer-only job store. A crash after a provider accepted a call can cause a repeated paid call: local transactions cannot promise exactly-once execution at an external LLM provider. Document this limit and bound it with attempts and timeouts.

Add `src/jobs/runner.test.ts` with a fake clock/provider and real SQLite. `pnpm -F @pulls.review/server test` must cover duplicate webhooks, concurrent budget claims, superseded heads, two competing claimers, heartbeat expiry, stale completion rejection, retry exhaustion, crash before/after result commit, and zero calls for skipped/terminal jobs. Include a subprocess kill/restart integration test, not only mocked lifecycle tests.

### 4. Package a reproducible container

Create a multi-stage Dockerfile using a pinned supported Node LTS image and the repository's pinned pnpm. Build core, embed, SPA, and server. Prefer a compatible Debian slim build/runtime pair for the SQLite native addon; test each published CPU architecture. Freeze dependency resolution, explicitly configure required dependency build scripts, and keep toolchains out of the runtime stage.

Run as a non-root user, listen on `0.0.0.0:3000`, and mount writable `/data` with documented ownership. Exclude `.env*`, `.dev.vars*` except templates, keys, database/dump files, backups, `.git`, and local dependencies from the build context. No secrets in build arguments or layers. Supply an example environment template with variable names only and explicit public origin/database path/concurrency settings.

Add `/health/live` and `/health/ready`; readiness checks migration completion, database access and runner health without depending on GitHub/LLM availability. Compose uses a named local volume, healthcheck, restart policy and a shutdown grace period matching the runner. Terminate HTTPS at the host reverse proxy. Default to a single server process, not Nitro cluster mode that would start extra runners.

Add `scripts/smoke-docker.mjs`, isolated to a temporary volume and local fake upstreams. Verify `docker build -t pulls-review:test .` and `node scripts/smoke-docker.mjs pulls-review:test` exit 0. Assert API/deep-link routing, assets/embed availability, config persistence after container recreation, raw webhook validation, queue recovery after kill, non-root operation, and successful native-driver loading.

### 5. Rehearse backup, import and cutover

Add backup and restore scripts using a SQLite-consistent backup mechanism, not a copy of the live main file that omits WAL. Keep encrypted off-host backups with retention and separately protected encryption secrets. Restore into a fresh volume and verify integrity, row counts and decryption. Document acceptable recovery time and data-loss window before deployment.

Provide an import command and a fixture-based `scripts/test-migration.mjs` that verifies counts for all nine tables, key relationships, IDs, timestamps, ciphertext hashes, schema/index equivalence, KV reconciliation, and final `PRAGMA integrity_check` = `ok`. Fail on unsupported schema or conflicting records rather than silently dropping data. D1 migration metadata is not Drizzle migration metadata; handle it explicitly.

Runbook for a later operator-approved cutover:

1. Rehearse against a protected export and a separate test GitHub App; keep production jobs disabled in the rehearsal.
2. Put the old service into a coordinated write/ingress freeze; drain the analysis queue and check its dead-letter queue. Record any jobs requiring reconciliation. Return retryable responses for incoming work and retain a delivery log for replay; do not rely on GitHub automatically redelivering failures.
3. Export D1 and all KV pages under the freeze, import into a fresh target volume, validate, and migrate. Carry over the exact secrets, same cookie configuration and preferably the same public origin. Preserve job IDs and explicitly reconcile any unfinished attempts.
4. Keep the old writer/consumer stopped, switch the origin routing, then enable the new runner. Replay deliveries received during the freeze idempotently. Test OAuth refresh, config sync, installation visibility, private authorization, manual analysis, automation and stored-result retrieval.
5. Before the new system accepts writes, rollback can restore the old service. After it accepts writes, do not simply switch back to stale D1: freeze again and reconcile/export new state first, or roll forward. Keep the old resources until the agreed rollback window and data verification finish.

Verify `node scripts/test-migration.mjs` exits 0 using synthetic fixtures and a restored backup. Live exports are operational follow-up, not needed for CI or this plan.

### 6. Make Docker the documented default

Add root server/dev/image scripts and CI gates. Update the architecture's Cloudflare-specific invariants to the equivalent server guarantees. Fix the stale README comments/automation description. Document setup, migrations, backups, restore, queue recovery, host sizing measurements and upgrades. Retire old code/config only after the rollback window; until then label the Worker deployment as the legacy production path.

Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, the Docker smoke command, and the migration rehearsal command. All must pass with no new failures. Confirm `rg -n 'D1Database|KVNamespace|MessageBatch|ExecutionContext|cloudflare:workers' packages/server/src` produces no matches. Update this plan/index status only when its implementation gates are complete.

## Done criteria and maintenance

- Fresh image starts with a clean volume and survives recreation with stored data intact.
- Existing API and authorization behavior passes regression tests; direct frontend URLs and embed artifacts work.
- Production-shaped D1/KV fixtures import without data loss; backups restore successfully.
- Analysis jobs recover after termination, respect budgets, and reject stale writes.
- No runtime dependency on Workers, D1, KV or Cloudflare Queues is required by the Docker path.
- Operator has a documented upgrade/cutover/rollback procedure and the cost comparison is based on measured usage.

Stop and revisit this design if deployment requires multiple hosts sharing writes, import schema/data cannot be reconciled, required encryption secrets are unavailable, or the selected native driver cannot be packaged for the target host. Pause the affected step on verification failures; do not weaken authorization, durability, or encryption to make tests pass. Unrelated working-tree changes must be preserved throughout.

Review future schema changes for import compatibility and transactional job invariants. Monitor database size, WAL growth, backup age, queue depth, retries and lease expiry. A later Nuxt migration should have its own plan and preserve the separate embed build.

## References checked during planning

- [Drizzle SQLite drivers](https://orm.drizzle.team/docs/sqlite/get-started-sqlite) documents native SQLite integrations. Resolve compatible stable versions during implementation; do not blindly copy prerelease install examples.
- [Nitro Node deployment](https://nitro.build/deploy/runtimes/node) documents standalone Node output and shutdown configuration.
- [Nuxt deployment](https://github.com/nuxt/nuxt/blob/main/docs/1.getting-started/16.deployment.md) documents client-only rendering and static output.
- [SQLite WAL](https://www.sqlite.org/wal.html) documents same-host requirements and the single-writer constraint.
- [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) documents SQL exports and export limitations; rehearsal must verify compatibility with local SQLite.

Planning covered backend/deployment architecture and migration risks. It did not audit the entire UI, benchmark production, inspect bills, export live data, or execute the implementation test suite.

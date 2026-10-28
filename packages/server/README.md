# GitHub App backend

`@pulls.review/server` provides GitHub OAuth, the authenticated GitHub proxy,
installation inventory, encrypted user/repository configuration, and PR analysis.
Nuxt serves these services through `packages/app/server`. SQLite and Drizzle
replace D1, KV, and Cloudflare Queues.

Better Auth handles OAuth, token refresh, and revocable sessions through its
Drizzle adapter. GitHub tokens are encrypted in SQLite; HttpOnly cookies contain
an opaque session credential. Token endpoints are disabled for browser requests.
The Vue client uses Better Auth's session state and sign-in/sign-out methods.

Existing sealed-cookie sessions require a fresh sign-in after this upgrade.
The `/api/auth/callback` alias preserves existing GitHub App registrations.
GitHub ids still key user settings, so signing in restores saved preferences.
Email permission is unnecessary: auth uses a synthetic address derived from the
GitHub id and disables account linking and public profile updates.

Provider keys retain their existing AES-GCM format in SQLite. Keep
`SESSION_SECRET` (at least 32 characters) and `CONFIG_ENCRYPTION_SECRET` stable
across upgrades and migrations. If an old session secret is shorter, first set
`CONFIG_ENCRYPTION_SECRET` to the old secret before rotating `SESSION_SECRET`;
otherwise settings encrypted with the fallback key cannot be decrypted.

## Run locally

From the repository root:

```sh
cp .env.example .env
pnpm install
pnpm -F @pulls.review/core build
pnpm dev
```

Configure the GitHub App callback at `/api/auth/callback`, setup URL at
`/api/github/setup`, and webhook at `/api/github/webhook`. GitHub needs a public
HTTPS URL or a development tunnel. Set `PUBLIC_ORIGIN` to that origin; the server
uses it for redirects and secure cookies instead of trusting forwarded hosts.

Register an App manually or use `/api/github/app/new`. Save the returned values
in the environment and generate separate random `SESSION_SECRET` and
`CONFIG_ENCRYPTION_SECRET` values with `openssl rand -hex 32`. Existing
installations must retain their existing secrets when migrating.

## Docker

```sh
cp .env.example .env
# Fill in the environment, including PUBLIC_ORIGIN for your HTTPS domain.
docker compose up -d --build
```

Compose binds port 3000 on loopback for a host reverse proxy. Terminate TLS at
that proxy. The image runs as the `node` user and stores SQLite in the named
`data` volume at `/data/pulls-review.sqlite`. Bind mounts need writable ownership
for UID 1000. A local filesystem is required; do not put this volume on NFS or
share it between hosts. Use one application instance initially.

Migrations run before the server becomes ready. To apply them separately, use
`pnpm -F @pulls.review/server db:migrate` locally or
`node scripts/database.mjs migrate /data/pulls-review.sqlite` in the image. `/health/live` checks HTTP
availability; `/health/ready` checks storage and runner health. The image includes
the site, embed script, migration files and database maintenance command.
`DATABASE_PATH`, `MIGRATIONS_PATH`, `PORT` and `HOST` may be overridden.

Repository automation is opt-in. Installing the App or configuring a host model
key does not enable paid webhook analysis. Manual runs use the signed-in user's
configured key, or require repository write permission to use the host key.

## Connect repositories and enable scans

Open `/repositories`, sign in with GitHub, and choose **Connect repositories**.
GitHub handles account selection, repository access, and organization approval.
The return page reloads the repositories visible to both the App and the user;
an installation callback alone does not establish access.

Choose **Scan settings** for a repository you administer. Select a provider,
model and API key, set a monthly run limit, enable scans, then save. New or
updated pull requests trigger the existing webhook runner. The settings page
shows recent runs and failures; refreshing history preserves unsaved edits.
Installing the App does not scan existing pull requests automatically.

Repository keys are encrypted and write-only. Leaving the key field blank
preserves a saved key. Organization defaults apply when no repository override
exists. A repository override needs its own key; an explicit disabled override
pauses scans even when the organization enables them. Returning to organization
defaults removes that override. Inherited usage reflects the organization's
shared budget. A run limit is not a currency spending cap.

The host must configure the App credentials and webhook secret before automatic
scans can run. Suspended installations and archived repositories are shown in
the setup flow. See [deployment setup](../../deploy/README.md) for registration.

## Background jobs

A transaction deduplicates webhook deliveries/active heads, reserves the monthly
run budget, and persists a queued job. The runner polls every second with one
job in flight. It uses expiring, heartbeated leases and retains attempts, failures
and results. Webhook jobs wait ten seconds to coalesce rapid pushes. Transient
failures retry with backoff, up to three attempts. Restarting the container
recovers expired leases.

Result persistence and successful job completion commit together. An expired
lease cannot write results. Shutdown stops polling and requests cancellation of
active model calls. External model calls cannot be guaranteed exactly once: a
crash after a provider accepts a request may result in a second paid call on
retry. Review `analysis_job` and `analysis_attempt` for terminal failures; rerun
through the existing manual analysis action when appropriate.

## Backup and restore

Use the included SQLite online backup command so WAL data is included:

```sh
docker compose exec app node scripts/database.mjs backup /data/pulls-review.sqlite /data/backup.sqlite
```

Copy backups off the host, encrypt them, and retain the encryption secrets
separately. Schedule backups according to the acceptable data-loss window.
The backup command refuses an existing destination and checks integrity.

For restore, stop the application, mount its volume in a one-off container, and
restore to a new filename:

```sh
docker compose stop app
docker compose run --rm --no-deps app node scripts/database.mjs restore /data/backup.sqlite /data/restored.sqlite
```

Point `DATABASE_PATH` at the restored file and start the service. Verify OAuth,
configuration and stored results before discarding the original. Never replace
a database file while the app has it open.

## Migrate the existing Cloudflare deployment

The import command accepts an export of all seven legacy D1 migrations and a
complete JSON array of KV installation records. It checks the schema, indexes,
row counts and copied values, preserves ciphertext/IDs, reconciles KV-only
installations, and recovers interrupted jobs. It refuses an existing destination.

1. Rehearse with a protected D1 SQL export, all KV pages, and a separate test
   GitHub App. Set `ANALYSIS_RUNNER_ENABLED=false` during rehearsal.
2. Freeze writes on the old deployment and stop incoming analysis triggers.
   Drain its queue and inspect the dead-letter queue. Log deliveries during the
   freeze for explicit replay; do not assume GitHub automatically retries them.
3. Export D1 using Wrangler (`d1 export pulls-review --remote --config deploy/legacy-cloudflare.jsonc --output=export.sql`)
   with the old account/configuration. Export KV values into a complete array
   of installation records. The old deployment remains external; do not run its
   deploy command from this migrated source tree.
4. Import into a fresh volume/database:

   ```sh
   node scripts/database.mjs import export.sql /path/to/new.sqlite installations.json
   ```

   Locally the command resolves dependencies from `packages/server`. In Docker
   it uses the bundled dependencies and `/app/migrations`.

5. Carry over the exact secrets. Prefer the same public origin so GitHub callback
   URLs and cookies continue to work. Switch routing with the old writer stopped,
   start the new runner, and replay missed deliveries idempotently.
6. Verify login/refresh, encrypted config, private PR authorization, installation
   inventory, manual analysis, automation and result retrieval.

Before the new app accepts writes, rollback can restart the frozen old service.
After new writes, freeze again and reconcile state before reverting to D1; a
simple DNS reversal would lose data. Retain old resources until verification and
an agreed rollback window are complete. Live export, routing changes and resource
removal are separate operator actions.

## Verification and maintenance

```sh
pnpm typecheck
pnpm test
pnpm build
node scripts/test-migration.mjs
docker build -t pulls-review:migration .
node scripts/smoke-docker.mjs pulls-review:migration
```

Add reviewed SQL migrations and journal entries under `migrations/`; update the
Drizzle schema in `src/db/schema.ts` alongside them. Never edit an applied
migration. Test fresh databases and upgrades against real SQLite. Monitor queue
age, retries, disk/WAL growth, backup age, CPU and memory. Reassess PostgreSQL if
multiple hosts or sustained write contention become necessary.

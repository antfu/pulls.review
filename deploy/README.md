# Diffwise on shea.shyim.de

The production Compose project lives in `/opt/diffwise` on `root@shea.shyim.de`.
Traefik serves `https://diffwise.shyim.de` over the existing `traefik_default`
network. SQLite lives in the `diffwise_data` volume at `/data/diffwise.sqlite`.
The app has no published host port.

Build the current workspace on the remote Docker engine:

```sh
DOCKER_HOST=ssh://root@shea.shyim.de docker build -t diffwise:latest .
scp deploy/compose.diffwise.yaml root@shea.shyim.de:/opt/diffwise/compose.yaml
ssh root@shea.shyim.de 'cd /opt/diffwise && docker compose up -d'
```

Keep `/opt/diffwise/.env` private (mode 600). It contains independent random
`SESSION_SECRET` and `CONFIG_ENCRYPTION_SECRET` values and the GitHub App
credentials. Preserve the secrets and volume across updates. To pin a release,
set `DIFFWISE_IMAGE` in that file to the corresponding image tag.

For the initial GitHub App, open
<https://diffwise.shyim.de/api/github/app/new> while signed in to GitHub. Register
Diffwise (or a unique App name if that name is taken), then save the returned
GitHub values into `/opt/diffwise/.env`. Keep the already generated session and
configuration secrets. Recreate the app with `docker compose up -d`, then open
<https://diffwise.shyim.de/api/github/install> to choose repositories.

GitHub sign-in stays unavailable until those credentials are configured. Public
repository browsing and uploaded diffs work before registration. The GitHub App
callback and webhook URLs are prefilled by the registration page.

Check readiness and back up SQLite:

```sh
curl --fail https://diffwise.shyim.de/health/ready
ssh root@shea.shyim.de 'cd /opt/diffwise && docker compose exec -T app node scripts/database.mjs backup /data/diffwise.sqlite /data/backup.sqlite'
```

The backup command requires a new destination filename. Copy backups off the
host as described in [the server operations guide](../packages/server/README.md).

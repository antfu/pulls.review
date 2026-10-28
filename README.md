# [Diffwise](https://diffwise.shyim.de)

> [!WARNING]
> Heavily work in progress.

Pull request review made simple. Groups changed files, summarizes what matters, and reviews them one scope at a time.

Diffwise is a self-hosted fork of [pulls.review](https://github.com/antfu/pulls.review), using Nuxt, Better Auth, and SQLite. Production deployment is documented in [deploy/README.md](./deploy/README.md).

## Use on Website

To use Diffwise on the website, simply visit [diffwise.shyim.de](https://diffwise.shyim.de) and follow the instructions to connect your GitHub account and start reviewing pull requests directly in your browser.

## Use in GitHub

You can optionally install userscript to enhance the GitHub interface with Diffwise features.

Go to [diffwise.shyim.de](https://diffwise.shyim.de/) and scroll down to the GitHub section to install the userscript.

## Automatic analysis with the GitHub App

Install the Diffwise GitHub App and enable analysis for selected repositories.
The Nuxt backend stores results in SQLite and serves them in the PR view.
Provider keys are encrypted; background jobs survive container restarts.
See [self-hosting and migration instructions](./packages/server/README.md).

## Self-host with Docker

```sh
cp .env.example .env
# Configure the GitHub App secrets and your public HTTPS origin.
docker compose up -d --build
```

SQLite lives in a persistent Docker volume. Put port 3000 behind an HTTPS reverse
proxy. Back up the volume with the included online backup command; keep encryption
secrets separately. Production cutover from Cloudflare requires the documented
D1/KV import and queue-drain procedure.

## Packages

| Package                                 | What it is                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| [`packages/app`](./packages/app)        | The site at [diffwise.shyim.de](https://diffwise.shyim.de) and the github.com embed. |
| [`packages/server`](./packages/server)  | GitHub App services, Drizzle/SQLite persistence and durable analysis jobs.           |
| [`@pulls.review/core`](./packages/core) | Fetching, parsing, grouping and summarizing diffs - runs in the browser and in Node. |

## Credits

Inspired heavily by [Linear's PR review guides](https://linear.app/docs/diffs#guides), thanks for the inspiration.

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg" alt="Sponsors"/>
  </a>
</p>

## License

MIT License

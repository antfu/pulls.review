FROM node:26.12.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.14.0
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild better-sqlite3 esbuild
RUN pnpm -F @pulls.review/core build && pnpm -F @pulls.review/app build

FROM node:26.12.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/pulls-review.sqlite MIGRATIONS_PATH=/app/migrations SQLITE_MODULE_ROOT=/app/server/package.json
COPY --from=build --chown=node:node /src/packages/app/.output ./
COPY --from=build --chown=node:node /src/packages/server/migrations ./migrations
COPY --chown=node:node scripts/database.mjs ./scripts/database.mjs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]

# Auth Gateway

Auth Gateway is a personal, security-focused proxy for managed upstream credentials. It keeps provider secrets encrypted, selects an eligible connection from an owner-scoped pool, and streams traffic through `/endpoint/{providerSlug}/*`.

The application is TypeScript-only: TanStack Start, Better Auth, Drizzle, PostgreSQL, and Bun. It supports exactly two production targets:

- Cloudflare Workers with a required Hyperdrive binding (the primary target).
- A Bun Docker container with PostgreSQL.

## Setup

Requirements: Bun 1.3.6, PostgreSQL, and a 32-byte base64url root secret.

```sh
bun install --frozen-lockfile
bun run secret:generate
# Set AUTH_GATEWAY_SECRET and DATABASE_URL in .env or your shell.
bun run db:migrate
bun run dev
```

Open `http://localhost:3000`. Initial setup creates the first account and is atomically claimed. Public signup remains blocked. The UI is intentionally personal-use focused, while every persisted resource remains scoped by Better Auth user ID for future multi-user provisioning.

## Configuration

| Variable | Required | Target | Purpose |
| --- | --- | --- | --- |
| `AUTH_GATEWAY_SECRET` | Yes | Both | Exactly 32 random bytes, encoded as unpadded base64url. Derives Better Auth, provider encryption, and initial-setup secrets. |
| `DATABASE_URL` | Yes | Docker and migrations | PostgreSQL connection string. Cloudflare Worker requests use `HYPERDRIVE` instead. |
| `PORT` | No | Docker | Listen port; defaults to `3000`. |

No public-origin, locale, or scheduler environment variables are supported. The public origin is validated installation data, and locales use the `PARAGLIDE_LOCALE` cookie.

## Scheduling

Both targets use the fixed UTC schedule `*/10 * * * *`. The shared scheduler acquires a PostgreSQL lease, prioritizes credential refresh before health checks, and performs no more than one network job per invocation. Daily metric cleanup is bounded and only runs when due.

Cloudflare receives native Worker cron events; Docker always registers `Bun.cron`. There is no HTTP cron endpoint. The cadence is 144 Worker cron invocations per day, deliberately conservative for the Workers Free-plan cron limits.

## Cloudflare Workers

1. Create a Hyperdrive configuration, add its real ID as `HYPERDRIVE` in `wrangler.jsonc`, and apply migrations from a trusted machine using a direct `DATABASE_URL`.
2. Store `AUTH_GATEWAY_SECRET` with `wrangler secret put AUTH_GATEWAY_SECRET`.
3. Deploy with `bun run deploy:cloudflare`.

The Worker has native `fetch` and `scheduled` handlers. Request-adjacent audit events, metrics, and API-key timestamps are aggregated with `ctx.waitUntil`; failures are sanitized and best-effort, never part of the request transaction.

## Bun Docker

```sh
set AUTH_GATEWAY_SECRET=<output from bun run secret:generate>
docker compose up --build
```

The container runs migrations before serving, uses `Bun.serve`, safely serves built static assets, records the socket peer address, registers native cron, and drains bounded background work on SIGTERM/SIGINT. PostgreSQL data stays in the named Compose volume.

## Security model

- Better Auth uses email/password, an 8-character minimum, database rate limits, explicit trusted origins, host-only secure cookies for HTTPS, and no public signup UI.
- All management Server Functions require a browser session and validate strict Zod payloads. `/docs` is session-protected; OpenAPI, health, OAuth callback, Better Auth, initial setup, and authenticated proxy are the only intentional public surfaces.
- Provider secrets are AES-256-GCM encrypted with associated data. API keys are stored as digests and revealed once.
- The streaming proxy caps request bodies at 100 MiB, validates paths and upstream URLs, blocks unsafe header injection and private/reserved literal targets unless explicitly opted in, handles redirects manually, and strips response cookies and hop-by-hop headers.
- English and Simplified Chinese use type-safe Paraglide messages. Locale selection writes a path-wide SameSite cookie without changing URLs.

## Checks

```sh
bun install --frozen-lockfile
bun run i18n:compile
bun run generate-routes
bun run check
bun run typecheck
bun test
bun run build:cloudflare
bun run build:docker
bun run build:cloudflare && bun run wrangler -- deploy --dry-run
docker build --check .
```

`bun run db:generate` only creates forward Drizzle migrations. Do not edit an applied migration or remove persistent Docker volumes without an approved data-removal operation.

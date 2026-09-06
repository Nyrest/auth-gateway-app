# Auth Gateway

Auth Gateway is a self-hosted gateway for sending requests to upstream providers through one stable endpoint. Configure a provider once, keep its credentials encrypted, and use a generated proxy API key from your applications.

## What you can do

- Connect generic HTTP endpoints and predefined providers, including API-key, OAuth/OIDC, and MCP providers.
- Add optional custom headers to every provider. Headers can be edited visually or as JSON, and values are encrypted with the provider credentials.
- Use the standalone **Generic HTTP** provider (`generic_headers`) when you need a provider with no predefined template. MCP providers accept custom headers directly.
- Create API keys with provider-level access rules.
- Test requests in Playground and inspect request metrics from the dashboard.

Custom headers are applied after provider authentication and fixed headers. They may therefore override those values; the UI shows a warning for known conflicts but does not block saving or sending. Supported `{{...}}` expressions in header values are resolved only when a request is sent.

Choose one deployment method below.

## Cloudflare Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Nyrest/auth-gateway-app)

The button opens Cloudflare's deployment flow for this repository. A PostgreSQL database is required; choose Hyperdrive or a direct PostgreSQL connection below.

1. Create a PostgreSQL database that your Worker can reach.
2. Choose a database connection mode:

   **Hyperdrive (recommended)** — creates a pooled connection close to your database. Create a configuration and note its ID:

   ```sh
   bunx wrangler hyperdrive create auth-gateway-db --connection-string="postgresql://USER:PASSWORD@HOST:5432/DATABASE"
   ```

   Add the binding to `wrangler.jsonc`:

   ```jsonc
   "hyperdrive": [{
     "binding": "HYPERDRIVE",
     "id": "your-hyperdrive-id"
   }]
   ```

   **Direct PostgreSQL** — store the connection string as a Worker secret. This mode does not need a Hyperdrive binding:

   ```sh
   bunx wrangler secret put DATABASE_URL
   ```

3. Add the required secret. Generate one locally with `bun src/scripts/generate-secret.ts`, then copy the single-line result when prompted:

   ```sh
   bunx wrangler secret put AUTH_GATEWAY_SECRET
   ```

4. Set `DATABASE_URL` to the direct PostgreSQL connection string on a trusted machine, apply the schema, and deploy:

   ```sh
   bun run db:migrate
   bun run deploy:cloudflare
   ```

After deployment, open the Worker URL, complete first-time setup, and create a proxy API key. Cloudflare cron triggers are included automatically.

## Docker

Docker Compose starts the application, runs the database migration once, and keeps PostgreSQL data in a named volume.

1. Copy the example environment file and set `AUTH_GATEWAY_SECRET`:

   ```sh
   cp .env.example .env
   bun src/scripts/generate-secret.ts
   ```

   Paste the generated value into `.env` without quotes or `=` padding.

2. Start the stack:

   ```sh
   docker compose up --build
   ```

3. Open <http://localhost:3000>, complete first-time setup, and create a proxy API key.

Stop the stack with `docker compose down`. The database volume is retained. To intentionally remove all local data, use `docker compose down -v`.

The Compose database is private to the stack and persists in a named volume.

## Environment variables

| Variable | Required | Used by | Description |
| --- | --- | --- | --- |
| `AUTH_GATEWAY_SECRET` | Yes | Worker and Docker | A stable secret containing exactly 32 random bytes, encoded as unpadded base64url (normally 43 characters). Generate it with `bun src/scripts/generate-secret.ts`. Keep it private and do not change it after storing connections or sessions. |
| `DATABASE_URL` | No for Hyperdrive or Docker Compose; yes for direct Cloudflare or standalone container | Cloudflare direct mode, Docker runtime, or migration commands | PostgreSQL connection string. Docker Compose supplies its internal value automatically. Cloudflare uses this secret for direct mode and ignores it when `HYPERDRIVE` is configured. |
| `PORT` | No | Docker | Application port; defaults to `3000`. If you change it, update the Docker port mapping as well. |

`HYPERDRIVE` is an optional Wrangler binding, not a `.env` variable. Configure it in `wrangler.jsonc` for the recommended pooled mode, or set `DATABASE_URL` as a Worker secret for direct mode.

## First use

1. Open the deployed application and create the initial account.
2. Go to **Connections → Create Connection**, choose a provider, and enter its endpoint and credentials.
3. Optionally expand **Custom Headers**. Use Visual mode for rows or JSON mode for an object such as:

   ```json
   {
     "X-Tenant": "acme",
     "X-Signature": "{{md5(secret)}}"
   }
   ```

4. Go to **API Keys**, create a key, and copy it immediately—the full value is shown only once.
5. Send requests through:

   ```sh
   curl "https://YOUR_HOST/endpoint/PROVIDER_SLUG/v1/models" \
     -H "Authorization: Bearer YOUR_PROXY_API_KEY"
   ```

   Replace `PROVIDER_SLUG` with the slug shown in Connections and append the path expected by that provider.

## Operational notes

- Provider credentials and custom header values are encrypted at rest and are never included in connection list responses.
- Proxy API keys are scoped to the providers you select and can be revoked from the dashboard.
- `localhost` and `127.0.0.1` are always permitted as upstream origins; other private-network addresses require the owner-only setting. In a Cloudflare Worker, these loopback addresses refer to the Worker runtime, not your computer.
- If you are upgrading from an early development build, recreate the database before running `bun run db:migrate`; databases created by the retired schema are not supported.

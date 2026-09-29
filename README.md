# Auth Gateway

Auth Gateway is a self-hosted Cloudflare Worker for sending requests to upstream providers through one stable endpoint. Configure a provider once, keep its credentials encrypted, and use a generated proxy API key from your applications.

## What you can do

- Connect generic HTTP endpoints and predefined providers, including API-key, OAuth/OIDC, and MCP providers.
- Add optional encrypted custom headers to every provider.
- Create API keys with provider-level access rules.
- Test upstream requests in Playground.
- Run scheduled token refresh, health checks, and expired OAuth state cleanup with a Cloudflare cron trigger.

Auth Gateway runs exclusively on Cloudflare Workers and stores all application data in Cloudflare D1.

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Nyrest/auth-gateway-app)

The deployment flow provisions the D1 database bound as `DB`, asks for `AUTH_GATEWAY_SECRET`, applies the migrations in `drizzle`, and deploys the Worker. Generate the secret locally with:

```sh
bun run secret:generate
```

After deployment, open the Worker URL, complete first-time setup, and create a proxy API key. The ten-minute Cloudflare cron trigger is included in `wrangler.jsonc`.

### Deploy from a local checkout

```sh
bun install
bunx wrangler secret put AUTH_GATEWAY_SECRET
bun run build
bun run deploy
```

`bun run deploy` applies pending remote D1 migrations before publishing the Worker.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and set a generated `AUTH_GATEWAY_SECRET`.
2. Prepare the local D1 database and start the Cloudflare development runtime:

   ```sh
   bun run db:migrate
   bun run dev
   ```

3. Open <http://localhost:3000> and complete first-time setup.

Wrangler stores the local D1 data under `.wrangler`, which is ignored by Git. Generate schema migrations with `bun run db:generate`; apply them remotely with `bun run db:migrate:remote`.

## Configuration

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `DB` | D1 binding | Yes | The sole application database. It is declared in `wrangler.jsonc` and provisioned automatically by Cloudflare's deployment flow. |
| `AUTH_GATEWAY_SECRET` | Worker secret | Yes | Exactly 32 random bytes encoded as unpadded base64url, normally 43 characters. It protects sessions and encrypted provider credentials; do not rotate it without a data migration. |

## First use

1. Open the deployed application and create the initial account.
2. Go to **Connections → Create Connection**, choose a provider, and enter its endpoint and credentials.
3. Optionally add custom headers in Visual or JSON mode, for example:

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
- Upstream requests are sent to the HTTP(S) URLs configured on each connection, including internal destinations.
- Back up production data before applying migrations.

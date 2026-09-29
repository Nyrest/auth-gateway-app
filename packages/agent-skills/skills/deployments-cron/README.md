# Deployments and cron source

Deployment decisions live in the repository root README, `wrangler.jsonc`, and `src/server/scheduler.server.ts`. Cloudflare Workers and D1 are the only supported runtime and database. Cloudflare's free-plan cadence and batch bound are intentional defaults: one `*/10 * * * *` trigger and one network job per tick keep database and CPU usage predictable. Update this source document whenever a platform limit, adapter, or lease contract changes.

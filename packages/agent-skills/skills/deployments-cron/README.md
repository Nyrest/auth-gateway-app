# Deployments and cron source

Deployment decisions live in the repository root README, `wrangler.jsonc`, `Dockerfile`, `docker-compose.yml`, and `src/server/scheduler.server.ts`. Cloudflare's free-plan cadence and batch bound are intentional defaults: one `*/10 * * * *` trigger and one network job per tick keep CPU and Hyperdrive usage predictable. Update this source document whenever a platform limit, adapter, or lease contract changes.

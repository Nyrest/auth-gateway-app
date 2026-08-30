---
name: deployments-cron
description: Deploy Auth Gateway to Cloudflare Workers first or a Bun Docker container with safe native cron scheduling.
metadata:
  type: lifecycle
  library: '@auth-gateway/agent-skills'
  library_version: '0.1.0'
sources:
  - skills/deployments-cron/README.md
---

# Deployments and cron

Cloudflare is the primary target. Use one `*/10 * * * *` trigger and a Hyperdrive binding named `HYPERDRIVE`; run Drizzle migrations from trusted tooling with a direct `DATABASE_URL`, never from a Worker request. The native Worker handler and Bun's native cron call the same idempotent service. Each tick processes at most one network job serially, refreshes before health probes, and uses expiring PostgreSQL leases. The one-job default is deliberate for the Workers Free 10 ms CPU limit; network wait time does not count toward CPU.

Keep `AUTH_GATEWAY_SECRET` as the only application secret. It derives Better Auth, AES-GCM, and setup-token keys with HKDF. Docker uses `Bun.serve`, runs migrations before serving, and always registers its ten-minute `Bun.cron` job.

## Common mistakes

- Adding a second per-provider cron trigger or increasing the batch without measuring Cloudflare limits.
- Running `db:migrate` inside a request or scheduled event.
- Deploying Cloudflare without a real Hyperdrive ID or putting the database URL in a client-visible variable.
- Adding an HTTP scheduler contract.

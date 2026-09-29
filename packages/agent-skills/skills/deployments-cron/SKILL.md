---
name: deployments-cron
description: Deploy Auth Gateway to Cloudflare Workers with D1 and safe native cron scheduling.
metadata:
  type: lifecycle
  library: '@auth-gateway/agent-skills'
  library_version: '0.1.0'
sources:
  - skills/deployments-cron/README.md
---

# Deployments and cron

Cloudflare Workers is the only deployment target and D1 is the only database. Use the `DB` binding and one `*/10 * * * *` trigger. Apply D1 migrations in the deployment command, never from a Worker request or scheduled event. Each tick processes at most one network job serially and refreshes before health probes. The one-job default is deliberate for the Workers Free 10 ms CPU limit; network wait time does not count toward CPU.

Keep `AUTH_GATEWAY_SECRET` as the only application secret. It derives Better Auth and AES-GCM keys with HKDF. Keep database access exclusively in the server-side D1 binding.

## Common mistakes

- Adding a second per-provider cron trigger or increasing the batch without measuring Cloudflare limits.
- Running `db:migrate` inside a request or scheduled event.
- Adding another database driver, database URL, or runtime-specific database abstraction.
- Adding an HTTP scheduler contract.

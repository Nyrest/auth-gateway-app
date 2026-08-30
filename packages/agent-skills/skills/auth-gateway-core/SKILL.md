---
name: auth-gateway-core
description: Build Auth Gateway features with TanStack Start server functions, Better Auth sessions, Drizzle tenant scoping, and encrypted provider state.
metadata:
  type: core
  library: '@auth-gateway/agent-skills'
  library_version: '0.1.0'
sources:
  - skills/auth-gateway-core/README.md
---

# Auth Gateway core

Read the co-located source document before changing application behavior. Keep management operations in authenticated TanStack Start server functions; reserve server routes for the proxy, Better Auth catch-all, OAuth callback, health, OpenAPI, and cron. A route guard improves navigation but is never an authorization boundary.

Use Better Auth for application login and `user.id` as the owner scope on every gateway table and query. This installation is intentionally personal-facing, but do not add global single-user assumptions to persistence or server functions. Validate strict server-function input with Zod and use CSRF middleware for browser mutations.

Keep provider secrets in per-field AES-GCM envelopes with associated data containing user, connection, and field identifiers. API keys are digests and plaintext is returned only at creation. Do not place secrets in logs, audit metadata, browser storage, `VITE_` variables, or response DTOs.

## Common mistakes

- Treating `_authenticated` route loaders as authorization. Call the auth middleware in each private server function.
- Reading another tenant's record by ID without including `userId` in the predicate.
- Reusing one nonce or storing an entire secret object in plaintext instead of encrypting fields independently.
- Adding an environment variable for data that belongs in the database (for example public origin or private-network opt-in).

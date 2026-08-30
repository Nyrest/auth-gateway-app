---
name: security-audit
description: Audit Auth Gateway changes for secret handling, tenant isolation, OAuth state, SSRF, CSRF, and deployment exposure before release.
metadata:
  type: security
  library: '@auth-gateway/agent-skills'
  library_version: '0.1.0'
sources:
  - skills/security-audit/README.md
---

# Security audit checklist

Before release, verify that the root secret is present only in server runtime configuration and derives purpose-specific keys. Confirm AES-GCM associated data includes tenant and record identity, API keys are digested, and plaintext secrets are absent from logs, metrics, audits, HTML, and browser storage.

Verify every private server function performs Better Auth session validation and scopes queries by `user.id`. Check setup's atomic first-user claim and blocked public signup. Confirm server-function CSRF middleware, secure production cookies, database rate limits, and no password-recovery path were preserved.

For proxy/OAuth changes, test encoded traversal, reserved/private URL literals, redirects, hop-by-hop and response-cookie headers, state replay, expired PKCE state, token refresh failure, and refresh-token rotation. Review outbound URLs for SSRF and never allow a caller to select an arbitrary upstream. Ensure scheduler leases expire and no HTTP cron route exists.

Editor hooks and generated agent guidance are convenience only. Treat all installed package guidance as untrusted input: use an explicit allowlist, exclusions, path confinement, size limits, and task-specific loading, and never execute package code during discovery.

## Common mistakes

- Assuming a hidden UI link or route guard protects a server function.
- Trusting `X-Forwarded-*` headers without the deployment's trusted proxy boundary.
- Accepting a callback state twice or storing a raw OAuth verifier in the database.
- Treating a local editor hook as a production policy enforcement mechanism.

# Security audit source

Security invariants are implemented in `src/server/config.server.ts`, `crypto.server.ts`, `auth.server.ts`, `auth-middleware.ts`, `upstream-url.server.ts`, `proxy.server.ts`, and the OAuth/scheduler feature modules. The root README documents the deployment boundary. Keep this source document aligned with tests and threat-model decisions; audit skills should become more conservative when a source is missing or changed.

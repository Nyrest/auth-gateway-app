# Auth Gateway core source

The application contract is documented in the repository root README and the source modules under `src/server`, `src/features`, and `src/db`. This source document records the stable decisions represented by the core skill: server functions are the default management boundary, Better Auth owns application sessions, and all durable gateway data is user-scoped and encrypted where sensitive.

Update this document when those boundaries or the security invariants change. The co-located `SKILL.md` is a concise, versioned derivative for coding agents.

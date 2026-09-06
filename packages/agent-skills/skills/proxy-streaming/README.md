# Proxy streaming source

The source of truth is `src/server/proxy.server.ts` and `src/server/url.server.ts`. The proxy contract is also exposed as `/api/openapi.json`. Changes to body forwarding, protected headers, redirect policy, pool eligibility, or URL handling require a focused security review and streaming integration test.

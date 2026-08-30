---
name: proxy-streaming
description: Implement or review Auth Gateway streaming proxy behavior, credential injection, header filtering, URL validation, and pool policy.
metadata:
  type: security
  library: '@auth-gateway/agent-skills'
  library_version: '0.1.0'
sources:
  - skills/proxy-streaming/README.md
---

# Proxy streaming

Keep request and response bodies as Web `ReadableStream` values. Forward only after a bearer API key is found by digest, is unrevoked and unexpired, and permits the requested provider pool. Select only enabled, active, healthy instances belonging to the key's user and optional instance scope.

Strip authorization, cookie, host, forwarding, hop-by-hop, and content-length headers. Inject credentials from decrypted secrets after filtering caller headers. Use `redirect: "manual"` and do not follow upstream redirects. Validate the base URL and every incoming path, including percent-encoded traversal and suspicious internal hosts.

Metrics may record provider, status, latency, and a trusted runtime-provided source IP. Never record request bodies, authorization values, cookies, secret configuration, or plaintext API keys. Defer best-effort accounting through the runtime collector; do not buffer the upstream stream to make accounting easier.

## Common mistakes

- Copying `Authorization` or `Host` from the caller after credential injection.
- Calling `response.text()` or `request.arrayBuffer()` on an arbitrary stream.
- Allowing `%2e%2e`, encoded slashes, or a redirect to escape the configured upstream origin.
- Selecting a connection across users because `providerSlug` was treated as globally unique.

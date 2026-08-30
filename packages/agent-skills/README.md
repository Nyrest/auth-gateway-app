# Auth Gateway Agent Skills

This package ships versioned [Agent Skills](https://agentskills.io) beside the Auth Gateway documentation. Install it with the application or another project, then run `bunx @tanstack/intent@latest install` so a supported coding agent can discover the skills.

The package also exports a small, optional loader for hosts that need stricter policy than the Intent CLI:

```ts
import { loadGuidanceForTask } from "@auth-gateway/agent-skills";

const guidance = await loadGuidanceForTask(process.cwd(), {
  task: "add an authenticated streaming proxy",
  policy: {
    allowlist: ["@auth-gateway/agent-skills"],
    exclusions: ["@auth-gateway/agent-skills#internal"],
  },
});
```

Discovery reads `package.json` and markdown files from installed packages only. It never imports, evaluates, or executes a dependency. The allowlist is deny-by-default, exclusions are applied after matching, skill paths are confined to their package, and only task-matching guidance is returned. Editor hooks can improve convenience but are not a security boundary; enforce the policy in the host process.

## Maintainer checks

```sh
bun run build
bun run check
bun run test
bun run intent:validate
bun run intent:stale
bun run pack:check
```

When a source document changes, update the relevant skill and `skills/sync-state.json`. The stale check intentionally fails on missing or changed source hashes rather than silently accepting drift.

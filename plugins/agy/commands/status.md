---
description: Show Antigravity background jobs (all, or one by id)
argument-hint: "[job-id]"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-status $ARGUMENTS
```

Render the JSON as a compact table: id, state, model, created, task (truncate
long tasks). If a job is `done` or `failed`, point at `/agy:result <id>`.

---
description: Cancel a running Antigravity background job
argument-hint: "<job-id>"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-cancel $ARGUMENTS
```

Confirm cancellation from the JSON. Unknown ids exit 64 and list known ids —
relay that to the user.

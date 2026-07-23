---
description: Show the output of an Antigravity background job
argument-hint: "<job-id>"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-result $ARGUMENTS
```

Present the `output` field verbatim. If `conversationId` is non-null, mention
the thread can be continued with `/agy:resume <conversationId> <follow-up>`.
If state is `running`, say so and suggest `/agy:status`.

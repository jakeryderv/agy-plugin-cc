---
description: Hand the current Claude Code session context to a new Antigravity conversation
argument-hint: "[--model <name>] [--effort low|medium|high]"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" transfer $ARGUMENTS
```

From the JSON: report how many turns were transferred, show agy's acknowledgement
(`response`), and give the user the `conversationId` with the exact follow-up
command: `/agy:resume <conversationId> <your next message>`. If it fails because
no session is known, explain the SessionStart hook records transcripts and a
fresh session is needed.

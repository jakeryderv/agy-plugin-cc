---
description: Hand the current Claude Code session context to a new Antigravity conversation
argument-hint: "[--model <name> | --effort low|medium|high]"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" transfer $ARGUMENTS
```

From the JSON: report how many turns were transferred and show agy's
acknowledgement (`response`). If `conversationId` is non-null, give the user the
exact follow-up command: `/agy:resume <conversationId> <your next message>`. If
it is null, say the transfer landed but no resumable conversation id was found
in agy's log, and that `/agy:resume <your next message>` continues the most
recent conversation instead. If it fails because no session is known, explain
the SessionStart hook records transcripts and a fresh session is needed.

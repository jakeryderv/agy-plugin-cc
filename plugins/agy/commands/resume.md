---
description: Continue a previous Antigravity conversation
argument-hint: "[conversation-id] <follow-up>"
allowed-tools: Bash(node:*)
---

Raw request: $ARGUMENTS

- If the first token looks like a conversation id (e.g. starts with `conv` or
  came from /agy:result), run:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run --conversation <id> <rest>`
- Otherwise continue the most recent conversation:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run --continue $ARGUMENTS`

Return agy's response verbatim. If no follow-up text was given, ask for one.

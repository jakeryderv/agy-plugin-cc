---
description: Continue a previous Antigravity conversation
argument-hint: "[conversation-id] <follow-up>"
allowed-tools: Bash(node:*)
---

Raw request: $ARGUMENTS

- If the first token is a conversation id — a UUID, i.e. 8-4-4-4-12 hex digits
  like `64bb96ef-8a49-4c85-9d5b-c321f9ee6512`, as reported by /agy:result or
  /agy:transfer — run, with that token removed from the follow-up:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run --conversation <id> <rest>`
- Otherwise continue the most recent conversation:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run --continue $ARGUMENTS`

Return agy's response verbatim. If no follow-up text was given, ask for one.

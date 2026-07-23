---
description: Read-only Antigravity (Gemini) review of the current working-tree diff
argument-hint: "[--model <name>] [--effort low|medium|high] [focus]"
allowed-tools: Bash(node:*)
---

Run (pass the user's arguments through verbatim):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review $ARGUMENTS
```

This is sandboxed and read-only; agy sees only the diff. Present agy's findings
verbatim, then add a short section of your own take: which findings you agree
with, which you'd push back on, and why. If it exits with "no changes to
review", tell the user there is nothing to review.

---
description: List models available to the Antigravity CLI
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" models
```

Show the list verbatim. Mention any command accepts either `--model <name>` or
`--effort low|medium|high`, but not both: the tier is part of the model name
(note the `-low`/`-medium`/`-high` variants in the list), so `--model` already
picks one. `--effort` alone sets the tier for the default model.

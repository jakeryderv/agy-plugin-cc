---
description: Check that the Antigravity CLI (agy) is installed and authenticated; offer install if missing
allowed-tools: Bash(node:*), Bash(curl:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" setup
```

Interpret the JSON:

- `ready: true` — report readiness in one short line (version, auth status, model count).
- `agy.available: false` — use AskUserQuestion once to offer running the official
  installer (`curl -fsSL https://antigravity.google/cli/install.sh | bash`), option
  "Install agy now (Recommended)" first, then "Skip for now". If installed, re-run
  the setup command above.
- `auth.status: "missing"` — tell the user to run `!agy` once interactively (OAuth)
  or export `ANTIGRAVITY_API_KEY`, then re-run `/agy:setup`. Do not attempt to
  authenticate for them.

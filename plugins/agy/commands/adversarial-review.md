---
description: Adversarial Antigravity (Gemini) review that challenges the design of the current diff
argument-hint: "[--model <name> | --effort low|medium|high] [stance]"
allowed-tools: Bash(node:*)
---

Run (pass the user's arguments through verbatim, keeping --adversarial first):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review --adversarial $ARGUMENTS
```

Sandboxed and read-only. Present agy's challenge verbatim, then respond to it
honestly: concede the points that land, rebut the ones that don't, with
reasoning. Do not perform agreement.

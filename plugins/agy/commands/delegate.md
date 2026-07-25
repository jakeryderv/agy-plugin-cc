---
description: Delegate a task to the Antigravity CLI (agy); use --background for long tasks
argument-hint: "[--background] [--full-access] [--model <name> | --effort low|medium|high] <task>"
allowed-tools: Bash(node:*), Agent
---

Raw request: $ARGUMENTS

- If it contains `--background`: strip that flag and run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-start <remaining args>`
  via Bash, then report the returned `jobId` and mention `/agy:status`,
  `/agy:result`, `/agy:cancel`.
- Otherwise: dispatch the `agy:agy-runner` subagent with the full remaining
  argument string as its task. Return its output verbatim.
- Tasks run sandboxed unless the user passed `--full-access` (which maps to
  agy's --dangerously-skip-permissions). Never add `--full-access` yourself.
- If no task text is present, ask the user what to delegate.

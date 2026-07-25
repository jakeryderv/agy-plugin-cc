# agy-plugin-cc

Use the Google Antigravity CLI (`agy`) from inside Claude Code — delegate
tasks, get cross-model code reviews, run background jobs, and continue
Antigravity conversations without leaving your session.

Modeled on the UX of [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc),
minus the app-server: agy has no server mode, so background jobs are detached
`agy -p` processes tracked in a file-based registry.

## Requirements

- [Antigravity CLI](https://antigravity.google) installed and authenticated
  (OAuth via running `agy` once, or `ANTIGRAVITY_API_KEY`)
- Node.js >= 18.18
- macOS / Linux / WSL

## Install

```
/plugin marketplace add jakeryderv/agy-plugin-cc
/plugin install agy@agy-plugin-cc
/reload-plugins
/agy:setup
```

## Commands

| Command | What it does |
|---|---|
| `/agy:setup` | Verify agy install + auth |
| `/agy:review [focus]` | Read-only, sandboxed review of your working-tree diff |
| `/agy:adversarial-review [stance]` | Steerable review that challenges the design |
| `/agy:delegate <task>` | Hand a task to agy; `--background` runs it as a job |
| `/agy:status [id]` | List background jobs / job detail |
| `/agy:result <id>` | Job output + conversation id for resuming |
| `/agy:cancel <id>` | Stop a running job |
| `/agy:resume [id] <follow-up>` | Continue the last (or a specific) agy conversation |
| `/agy:transfer` | Seed a new agy conversation from your Claude session |
| `/agy:models` | List available models |

Every task command accepts **either** `--model <name>` (validated against live
`agy models` output) **or** `--effort low|medium|high` — not both. agy carries
the effort tier in the model name (`gemini-3.6-flash-low`,
`gemini-3.1-pro-high`), so `--model` already selects a tier; `--effort` on its
own sets the tier for the default model. Passing both is rejected with an
explanation.

## Safety model

- Reviews always run `agy --sandbox`; agy sees the diff only.
- Delegated tasks are sandboxed by default. `--full-access` (maps to agy's
  `--dangerously-skip-permissions`) must be passed explicitly by you; the
  plugin never adds it.
- The plugin only invokes your local `agy` binary with your existing auth; it
  never touches credentials.

## State

Jobs and session pointers live under `~/.agy-plugin/` (override with
`AGY_PLUGIN_STATE_DIR`). Job directories older than 7 days are pruned
automatically.

## Known issues

Tracked in [GitHub Issues](https://github.com/jakeryderv/agy-plugin-cc/issues).
Anything labelled [`confirmed`](https://github.com/jakeryderv/agy-plugin-cc/issues?q=is%3Aissue+is%3Aopen+label%3Aconfirmed)
was reproduced against running code, with the evidence in the issue.

## Development

```
node --test tests/*.test.mjs
```

Zero npm dependencies. Tests run against `tests/fake-agy`, never the real CLI —
so the suite cannot catch the stub drifting from what `agy` actually does.
[`docs/smoke-test.md`](docs/smoke-test.md) is the checklist against the real
binary; run it before cutting a release.

## License

MIT

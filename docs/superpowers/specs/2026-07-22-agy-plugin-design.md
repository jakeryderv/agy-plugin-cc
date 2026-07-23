# agy-plugin-cc — Claude Code plugin for the Google Antigravity CLI

**Date:** 2026-07-22
**Status:** Approved
**Repo:** github.com/jakeryderv/agy-plugin-cc

## Purpose

A Claude Code plugin that integrates the Google Antigravity CLI (`agy`) the way
`openai/codex-plugin-cc` integrates Codex: delegate tasks, get cross-model code
reviews, manage background jobs, and continue Antigravity conversations —
without leaving Claude Code.

Reference model: the official OpenAI codex plugin (command surface, UX,
JSON-speaking companion script). Not replicated: its persistent app-server
broker — agy has no server mode, so jobs are detached `agy -p` processes with a
file-based registry. This yields the same UX with a fraction of the code.

## Constraints and environment

- `agy` >= 1.0.x with native `--model`, `--effort`, `--sandbox`, `--mode`,
  `--continue`, `--conversation <id>`, `-p/--print`, `--print-timeout`,
  `--log-file`, and `agy models` listing. No hardcoded model tables — validate
  against live `agy models` output.
- Node.js >= 18.18 (companion runtime). Zero npm dependencies.
- Auth belongs to agy (OAuth keyring or `ANTIGRAVITY_API_KEY`); the plugin
  never touches credentials.
- Headless `-p` mode cannot answer permission prompts, so every headless run
  must be either sandboxed or explicitly granted full access.

## Repo layout

```
agy-plugin-cc/
├── .claude-plugin/marketplace.json        # marketplace name: "agy-plugin-cc"
├── plugins/agy/
│   ├── .claude-plugin/plugin.json         # plugin name: "agy" → /agy:* commands
│   ├── commands/
│   │   ├── setup.md
│   │   ├── review.md
│   │   ├── adversarial-review.md
│   │   ├── delegate.md
│   │   ├── status.md
│   │   ├── result.md
│   │   ├── cancel.md
│   │   ├── resume.md
│   │   ├── transfer.md
│   │   └── models.md
│   ├── agents/agy-runner.md               # foreground delegate executor
│   ├── hooks/hooks.json                   # SessionStart hook only
│   └── scripts/
│       ├── agy-companion.mjs              # single entrypoint, subcommand dispatch
│       ├── session-hook.mjs               # records transcript path per session
│       └── lib/
│           ├── agy.mjs                    # locate binary, auth status, invoke, model validation
│           ├── jobs.mjs                   # job registry: create/spawn/status/result/cancel
│           ├── transcript.mjs             # Claude transcript JSONL → handoff prompt
│           ├── args.mjs                   # flag parsing shared by subcommands
│           └── render.mjs                 # JSON output helpers
├── tests/                                 # node --test + fake-agy stub
├── .github/workflows/ci.yml               # lint (node --check) + tests
├── README.md
└── LICENSE                                # MIT
```

## Commands

All task commands accept `--model <name>` and `--effort low|medium|high`,
passed through natively. Model values are validated against `agy models`; an
unknown value fails with the live list printed.

| Command | Behavior |
|---|---|
| `/agy:setup` | Companion `setup --json`: binary found (PATH + common locations), version, auth status, models reachable. Reports readiness; offers official installer only if missing, via one AskUserQuestion. |
| `/agy:review [focus]` | Read-only review of the working tree diff (`git diff HEAD`, fallback unstaged). Runs `agy -p --sandbox` with a review prompt embedding the diff. Optional focus string steers attention. |
| `/agy:adversarial-review [stance]` | Same mechanics as review, adversarial prompt: challenge design decisions, hunt for weaknesses, argue against the approach. Optional stance steers the challenge. |
| `/agy:delegate <task>` | Foreground: hand to `agy-runner` subagent (one companion call, output verbatim). `--background`: companion `job-start`, returns job id immediately. `--full-access` opts out of sandbox. |
| `/agy:status [id]` | List active/recent jobs or detail one: state (running/done/failed/cancelled), runtime, task summary. |
| `/agy:result <id>` | Print job output + recovered agy conversation id (for resume). |
| `/agy:cancel <id>` | Kill the job's process tree; mark cancelled. |
| `/agy:resume [id] <follow-up>` | `agy -p --continue` (no id) or `--conversation <id>` (explicit, incl. ids recovered from jobs). |
| `/agy:transfer` | Build a handoff prompt from the current Claude session transcript, start an agy conversation with it, return the conversation id. |
| `/agy:models` | Live `agy models` output. |

## Companion script contract

`node scripts/agy-companion.mjs <subcommand> [flags]` — subcommands: `setup`,
`run`, `review`, `job-start`, `job-status`, `job-result`, `job-cancel`,
`transfer`, `models`.

- Structured results (setup, job-*) emit a single JSON object on stdout;
  streamed agy output (run, review) passes through verbatim.
- Exit codes: 0 success, 1 runtime failure (agy error, quota, auth), 64 usage
  error, 127 agy not installed.
- Known agy failure modes (quota exhaustion, auth expiry) are detected from
  agy stderr/log output and surfaced as human-readable `error` fields.

## Job registry

State root `~/.agy-plugin/` (override: `AGY_PLUGIN_STATE_DIR`).

```
~/.agy-plugin/
├── jobs/<job-id>/
│   ├── meta.json      # task, model, effort, flags, state, pid, timestamps, exit code
│   ├── output.log     # combined stdout/stderr of the agy run
│   └── agy.log        # per-job --log-file → conversation id recovery
└── sessions/<session-id>.json   # transcript path, cwd (written by SessionStart hook)
```

- `job-start`: validate flags, write meta, spawn detached
  (`setsid`/`detached: true`, stdio → output.log), record pid, return
  `{jobId}` immediately.
- No daemon: the spawned command is a thin shell wrapper
  (`agy ... ; echo $? > exit-code`) so completion and exit status are visible
  on disk. `job-status` derives state lazily: exit-code file present → done or
  failed; absent + pid alive → running; absent + pid dead → failed (crashed).
- `job-cancel`: SIGTERM to the process group, SIGKILL after grace, mark
  cancelled.
- Jobs older than 7 days are pruned opportunistically on any job-* call.

## SessionStart hook

`hooks/hooks.json` registers one SessionStart hook → `session-hook.mjs`. It
reads the hook payload from stdin (`session_id`, `transcript_path`, `cwd`) and
writes `sessions/<session-id>.json`. No other hooks. No Stop hook / review
gate.

## Transfer

`transfer` loads the current session's transcript path (from the hook state,
keyed by `CLAUDE_SESSION_ID` env or newest session file for the cwd), parses
the JSONL, extracts the last N user/assistant text turns (bounded byte
budget, tool noise stripped), and composes a handoff prompt: context summary +
"you are taking over; wait for the user's follow-up." Starts
`agy -p --sandbox` with it, extracts the conversation id from the per-call log
file, returns `{conversationId}` for use with `/agy:resume`.

## Safety model

- Review commands: always `--sandbox`. The diff is embedded in the prompt;
  agy never needs write access.
- Delegate/transfer: `--sandbox` by default; `--full-access` maps to
  `--dangerously-skip-permissions` and is never implied.
- The plugin invokes only the local `agy` binary; the single external URL
  (Google's installer) is suggested in setup and only run with explicit user
  consent.

## Error handling

- agy missing → exit 127 with install guidance (setup offers install).
- Auth missing → guidance to run `agy` interactively or set
  `ANTIGRAVITY_API_KEY`.
- Empty diff on review → clear error, no agy call.
- Unknown model/effort → exit 64 with live model list.
- Job id not found → exit 64 listing known ids.
- agy quota/auth failures mid-run → surfaced in result output, job marked
  failed.

## Testing

- `node --test tests/` — unit tests for lib/ modules (args, jobs lifecycle,
  transcript extraction, model validation) against a `tests/fake-agy` stub
  script that mimics agy's flags, output, and log file.
- Smoke script exercising companion subcommands end-to-end with the stub.
- CI: GitHub Actions running `node --check` on all .mjs + the test suite on
  Node 18 and 24.

## Publishing

- GitHub repo `jakeryderv/agy-plugin-cc` (public), MIT.
- Install: `/plugin marketplace add jakeryderv/agy-plugin-cc` →
  `/plugin install agy@agy-plugin-cc`.
- Version starts 0.1.0 in plugin.json; CHANGELOG.md from first release.

## Out of scope (v0.1)

- Stop-hook review gate (deliberate omission — noisy).
- Image generation and research commands (community plugin features; add
  later if wanted).
- Windows support (macOS/Linux/WSL only, matching agy itself).
- Any persistent daemon/broker.

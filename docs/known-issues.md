# Known issues (ship-as-known minors)

Triaged at the v0.1.0 final review as acceptable to ship; each is a candidate
`/opsx:propose` change. Remove entries as they're fixed (the fix's OpenSpec
change is the record). Letters match the original build ledger; (a) and (g)
are already fixed.

- **(b) exit-code file read race** — `jobState()` can read the exit-code file
  in the window after bash creates it but before the digit lands, parsing an
  empty string to `NaN` and reporting a transient `failed` for a job that
  exited 0. Self-heals on the next status call.
- **(c) permissive model validation on listModels failure** — when
  `agy models` fails, `validateModel()` accepts any model string
  (deliberate: availability outage shouldn't block runs), so typos surface as
  agy errors instead of the friendly exit-64 list.
- **(d) review validates model before empty-diff check** — `/agy:review` with
  an unknown model and an empty diff spends a live `agy models` call before
  reporting the empty diff.
- **(e) empty-diff message imprecise outside a git repo** — review's "working
  tree has no changes" error is misleading when the cwd isn't a git repo at
  all.
- **(f) jobSummary state-fallback contract undocumented** — `jobSummary()`
  falls back to `meta.state` when lazy derivation returns nothing; the
  precedence isn't documented in the module.
- **(h) resume conversation-id heuristic is fuzzy** — `/agy:resume` recovers
  conversation ids from log text by regex; unusual log formats can surface a
  wrong id. Mitigated by `extractConversationId` taking the last match.
- **session file name unsanitized** — `session-hook.mjs` uses `session_id`
  verbatim as a filename; a hostile/malformed id could path-escape. Ids come
  from Claude Code itself, so exposure is theoretical.
- **ARG_MAX ceiling on huge review diffs** — review embeds the diff in the
  agy prompt argv; multi-MB diffs can exceed the platform arg limit
  (notably lower on macOS).
- **parseArgs flag-as-value swallowing** — `--model --sandbox` consumes
  `--sandbox` as the model value rather than erroring.
- **cancel/complete race** — cancelling a job in the instant it finishes can
  mark a completed job `cancelled` (narrow window between the state check and
  SIGTERM).
- **pruning only runs in listJobs** — job-dir cleanup (7-day + corrupt-meta)
  triggers only on `job-status` listing calls; a user who never lists jobs
  accumulates state until they do. See `openspec/specs/job-cleanup/spec.md`.
- **extractTurns maxBytes counts UTF-16 chars** — the transfer byte budget
  measures JS string length, so multi-byte text can exceed the intended
  budget in real bytes.

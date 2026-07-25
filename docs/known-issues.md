# Known issues (ship-as-known minors)

Triaged at the v0.1.0 final review as acceptable to ship; each is a candidate
`/opsx:propose` change. Remove entries as they're fixed (the fix's OpenSpec
change is the record). Letters match the original build ledger; (a), (b), (g),
and (h) are already fixed.

Entries marked **[confirmed]** were reproduced against the real agy CLI during
the 2026-07-25 smoke pass; the rest remain analysis-only.

- **(c) permissive model validation on listModels failure** — when
  `agy models` fails, `validateModel()` accepts any model string
  (deliberate: availability outage shouldn't block runs), so typos surface as
  agy errors instead of the friendly exit-64 list.
- **(d) review validates model before empty-diff check** *[confirmed]* —
  `/agy:review` with an unknown model and an empty diff spends a live
  `agy models` call (~1.3s) before reporting the empty diff.
- **(e) empty-diff message imprecise outside a git repo** *[confirmed]* —
  outside a git repo, review reports "no changes to review (git diff HEAD and
  git diff are both empty)" when in fact both git invocations failed. The two
  cases are indistinguishable to the user.
- **(f) jobSummary state-fallback contract undocumented** — `jobSummary()`
  falls back to `meta.state` when lazy derivation returns nothing; the
  precedence isn't documented in the module.
- **session file name unsanitized** — `session-hook.mjs` uses `session_id`
  verbatim as a filename; a hostile/malformed id could path-escape. Ids come
  from Claude Code itself, so exposure is theoretical.
- **ARG_MAX ceiling on huge review diffs** — review embeds the diff in the
  agy prompt argv; multi-MB diffs can exceed the platform arg limit
  (notably lower on macOS).
- **parseArgs flag-as-value swallowing** *[confirmed]* — a value flag missing
  its value consumes the next flag as the value: `--model --effort x` takes
  `--effort` as the model name. It does exit 64, but blames the model
  (`unknown model "--effort"`) instead of reporting the missing value, and
  would silently misparse if the swallowed token happened to be valid.
  (`--sandbox`, the example previously given here, is not a companion flag.)
- **cancel/complete race** — cancelling a job in the instant it finishes can
  mark a completed job `cancelled` (narrow window between the state check and
  SIGTERM).
- **pruning only runs in listJobs** — job-dir cleanup (7-day + corrupt-meta)
  triggers only on `job-status` listing calls; a user who never lists jobs
  accumulates state until they do. See `openspec/specs/job-cleanup/spec.md`.
  The retired v0.1 design doc specified pruning on *any* `job-*` call, which is
  arguably the better design; the narrowing was never a recorded decision.
- **extractTurns maxBytes counts UTF-16 chars** — the transfer byte budget
  measures JS string length, so multi-byte text can exceed the intended
  budget in real bytes.
- **no automated end-to-end coverage of the subcommand surface** — the suite
  unit-tests `lib/` modules against the fake-agy stub; the retired v0.1 design
  doc specified a stub-driven end-to-end smoke script that was never built.
  Real-CLI coverage is `docs/smoke-test.md`, which is manual.

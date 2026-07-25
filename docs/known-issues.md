# Known issues (ship-as-known minors)

Each entry is a candidate `/opsx:propose` change. Remove entries as they're
fixed (the fix's OpenSpec change is the record). Letters match the original
v0.1.0 build ledger; (a), (b), (g), and (h) are fixed.

Every entry below was **reproduced or verified against the code on
2026-07-25**, and states what was observed rather than what was suspected.
Where an entry's original description turned out to be wrong, the correction
is noted. Severity ordering is roughly worst-first.

## Reproduced defects

_The audit reproduced four. Three were fixed in v0.1.3 — the cancel/complete
race, the session-id path traversal, and the 3× transfer-budget overshoot. The
one below remains, deferred because the fix is a design decision rather than a
correction._

- **ARG_MAX ceiling on review diffs — ~128 KiB, not multi-MB.**
  Review embeds the diff in agy's argv. Measured on Linux: diffs of 62 KB,
  118 KB, and 128 KB succeed; 253 KB and 1 MB fail with
  `spawnSync … E2BIG` and exit 1. The binding limit is `MAX_ARG_STRLEN`
  (131072 bytes for a single argument), not the 4 MB total `ARG_MAX`.
  *Correction:* the original entry said "multi-MB diffs" — the real ceiling is
  an order of magnitude lower and well within reach of an ordinary large
  refactor. It also claimed the limit is "notably lower on macOS"; that is
  probably inverted, since the 128 KiB per-argument cap is a Linux-specific
  limit and macOS constrains total argv instead. **Unverified — not tested on
  macOS.**
  Beyond the size, the failure is unactionable: the user sees a raw
  `spawnSync … E2BIG` with no indication the diff was too large. Fix: pass the
  prompt via stdin or a temp file; failing that, detect the size and say so.

- **(c) permissive model validation on `listModels` failure.** Confirmed: with
  a binary whose `models` call exits non-zero, `listModels()` returns null and
  `validateModel()` accepts an arbitrary string without throwing. Deliberate —
  an availability outage should not block a run — and recorded in
  `openspec/specs/companion-contract/spec.md`. The cost is that a typo reaches
  agy as an error instead of the friendly exit-64 list.

- **(d) review validates model before the empty-diff check.** `/agy:review`
  with an unknown model and an empty diff spends a live `agy models` call
  (~1.3 s) before reporting the empty diff.

- **(e) empty-diff message is imprecise outside a git repo.** Review reports
  "no changes to review (git diff HEAD and git diff are both empty)" when both
  git invocations actually failed. The two cases are indistinguishable to the
  user.

- **parseArgs flag-as-value swallowing.** A value flag missing its value
  consumes the next flag: `--model --effort x` takes `--effort` as the model
  name. It does exit 64, but blames the model (`unknown model "--effort"`)
  rather than reporting the missing value, and would misparse silently if the
  swallowed token happened to be a valid value.

- **pruning only runs in `listJobs`.** Job-dir cleanup (7-day + corrupt-meta)
  triggers only on a bare `job-status` listing; `job-status <id>` and every
  other subcommand skip it, so a user who never lists jobs accumulates state.
  See `openspec/specs/job-cleanup/spec.md`. The retired v0.1 design doc
  specified pruning on *any* `job-*` call, which is arguably the better design;
  the narrowing was never a recorded decision.

- **(f) `jobSummary` state-fallback precedence is undocumented.** `jobSummary()`
  resolves `meta.state ?? jobState(meta)`, preferring a `state` field on the
  meta object over deriving it. Benign today: `meta.json` never stores `state`,
  so the field is only ever present on the objects `listJobs()` builds, where
  it came from `jobState()` anyway. It is a latent hazard of the same shape as
  the old `buildAgyArgs` gap — if `state` were ever persisted, it would
  silently outrank derivation and contradict the "state is derived, never
  stored" requirement in `openspec/specs/job-registry/spec.md`.

## Withdrawn

- ~~**no automated end-to-end coverage of the subcommand surface**~~ — **this
  entry was wrong and has been removed.** It was added on the assumption that
  the v0.1 design doc's never-built "smoke script" meant no such coverage
  existed. In fact `tests/companion-*.test.mjs` spawn the real companion
  against the fake-agy stub across 18 tests covering all nine subcommands
  (`setup`, `models`, `run`, `review`, `job-start`, `job-status`, `job-result`,
  `job-cancel`, `transfer`) plus the unknown-subcommand path. The coverage
  exists as tests rather than as a script, which is the better form.
  Real-CLI coverage remains manual, in `docs/smoke-test.md` — that part stands.

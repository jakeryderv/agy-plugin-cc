# Proposal: fix-cancel-race-and-session-input

## Why

Three findings from the 2026-07-25 ledger audit, all reproduced.

**A cancelled-but-completed job is mislabelled permanently.** `cancelJob()`
checks state, signals the process group, waits out the grace period, then sets
`cancelled = true` unconditionally — it never re-checks whether the job
recorded an exit status meanwhile. Because `cancelled` is persisted to
`meta.json` and outranks exit status in state derivation, a job that finished
on its own during that window is mislabelled for good. Reproduced: a job
reporting `state: cancelled`, `exitCode: 0`, and `output: "hello-from-job"`
simultaneously. The original ledger entry called this a "narrow window"; the
window is narrow, but the damage is permanent and the completed output is
hidden behind the wrong state.

**The SessionStart hook can write outside the state directory.**
`session-hook.mjs` interpolates `session_id` straight into a path. Reproduced
with `session_id: "../../escaped"`: the hook exits 0 and writes
`/tmp/escaped.json`, outside the state root entirely, leaving `sessions/`
empty. Ids come from Claude Code rather than user input, so the trigger is
unlikely — but the mechanism is real, not theoretical, and the guard is cheap.

**The transfer size budget overshoots by 3×.** `extractTurns()` compares JS
string length against a byte budget. Measured with CJK text: a 16000-byte
budget retained 48000 real bytes — exactly 3.00×, and 4× is reachable with
astral characters. The budget exists to bound the prompt; it currently doesn't.

## What Changes

- `cancelJob()` re-reads the exit status after the grace wait. A recorded
  status means the job finished under its own power, so its terminal state is
  returned and `cancelled` is never written. Verified that a SIGTERMed wrapper
  records nothing at all, so a recorded status is unambiguous evidence of
  self-completion rather than of our signal.
- Session ids are validated before being used as filenames, in both the hook
  that writes them and the lookup that reads them. An id that is not a plain
  safe filename is refused rather than sanitised into a different one, so the
  two sides cannot disagree about which file a session lives in.
- `extractTurns()` measures its budget with `Buffer.byteLength(text, 'utf8')`.
- The three ledger entries are removed from `docs/known-issues.md`.

## Capabilities

### Modified Capabilities

- `job-registry`: cancellation yields to a job that already finished.
- `session-transfer`: session ids are constrained to safe filenames, and the
  extraction budget is measured in real bytes.

## Impact

- `plugins/agy/scripts/lib/jobs.mjs` (`cancelJob`)
- `plugins/agy/scripts/lib/transcript.mjs` (`latestSession`, `extractTurns`,
  new id validation)
- `plugins/agy/scripts/session-hook.mjs` (id validation before writing)
- `tests/jobs.test.mjs`, `tests/session-hook.test.mjs`,
  `tests/transcript.test.mjs`
- `docs/known-issues.md`
- Behaviour change users can see: cancelling a job that just finished now
  reports `done`/`failed` with its output intact, instead of `cancelled`.

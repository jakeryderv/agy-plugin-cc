# Proposal: harden-sandbox-default-and-job-state

## Why

Two invariants the specs already assert are not actually enforced by the code
that has to hold them.

**The sandbox default is not enforced at the chokepoint.** `buildAgyArgs()`
adds the sandbox flag via `else if (opts.sandbox)`, so a caller that passes
neither `fullAccess` nor `sandbox` gets a headless agy run with *no* access
flag at all — unsandboxed, silently. All four current call sites pass
`sandbox: true`, so `sandbox-safety` holds today, but it holds by caller
discipline rather than by construction. `tests/agy.test.mjs:45` already
constructs such a call and asserts nothing about its access mode, which is how
much attention the gap has had. Found while verifying `sandbox-safety` against
the code during the docs migration.

**A finished job can be reported as failed.** `jobState()` treats the presence
of the `exit-code` file as a verdict, but `startJob()`'s wrapper creates that
file by shell redirection before `echo` writes the digit. Reading in that
window parses an empty string to `NaN`, which is not `0`, so a job that exited
successfully is reported `failed`. This is known issue (b). It self-heals on
the next call, which makes it a poor bug rather than a harmless one: a caller
that polls once and acts — a script, or a user reading `/agy:status` — gets a
wrong answer with no indication it is unstable.

## What Changes

- `buildAgyArgs()` fails closed: an invocation is sandboxed unless
  `fullAccess` was explicitly requested. The `sandbox` option is removed rather
  than defaulted, so there is no longer any input that produces an unsandboxed
  run other than an explicit full-access request, and no way for a future
  caller to reintroduce the gap by omission.
- `jobState()` treats an `exit-code` file it cannot read a complete integer
  from as "not finished yet" and falls through to the liveness check, so the
  status is `running` while the wrapper is mid-write and `failed` only if the
  process actually died without recording one.
- `jobResult()` reports the exit code as absent rather than as `NaN` in the
  same window.
- Ledger entries (b) and the `buildAgyArgs` hazard are removed from
  `docs/known-issues.md`.

## Capabilities

### Modified Capabilities

- `sandbox-safety`: the sandbox default becomes a property of argument
  construction rather than of caller discipline.
- `job-registry`: state derivation distinguishes a recorded exit status from a
  file that exists but does not yet carry one.

### New Capabilities

(none)

## Impact

- `plugins/agy/scripts/lib/agy.mjs` (`buildAgyArgs`)
- `plugins/agy/scripts/lib/jobs.mjs` (`jobState`, `jobResult`)
- `plugins/agy/scripts/agy-companion.mjs` and
  `plugins/agy/scripts/lib/jobs.mjs` call sites (drop the now-removed
  `sandbox: true` argument)
- `tests/agy.test.mjs`, `tests/jobs.test.mjs` (regression tests)
- `docs/known-issues.md`
- No change to any command's observable behaviour: every current invocation is
  already sandboxed, and the job-state fix only affects a window that
  previously produced a wrong answer.

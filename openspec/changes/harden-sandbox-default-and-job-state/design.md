# Design: harden-sandbox-default-and-job-state

## Context

Both defects are cases where a spec requirement is true of the system today but
is not guaranteed by the code that would have to keep it true.

`buildAgyArgs()` (`lib/agy.mjs`) is the single place agy's argv is built; every
headless run in the plugin goes through it. Its access-mode branch is:

```js
if (opts.fullAccess) args.push('--dangerously-skip-permissions');
else if (opts.sandbox) args.push('--sandbox');
```

With neither option set, neither flag is emitted. agy then runs headless with
its default permissions and no sandbox — the exact outcome `sandbox-safety`
exists to prevent. The four call sites (`cmdRun`, `cmdReview`, `cmdTransfer`,
`startJob`) all pass `sandbox: true`, so nothing is broken in shipped code.

`jobState()` (`lib/jobs.mjs`) derives state from the filesystem. `startJob()`
runs the job under a bash wrapper ending in `echo $? > exit-code`. The `>`
redirection creates the file before `echo` writes to it, so there is a window
in which `exit-code` exists and is empty. `parseInt('', 10)` is `NaN`, and
`NaN === 0` is false, so the branch returns `failed` for a job that succeeded.

## Goals / Non-Goals

**Goals:**
- No input to `buildAgyArgs()` produces an unsandboxed run except an explicit
  full-access request.
- A job that exited 0 is never reported `failed`, in any window.
- Both regressions covered by deterministic tests — no timing-dependent tests.

**Non-Goals:**
- The cancel/complete race, `parseArgs` flag-as-value swallowing, or the review
  ordering issues (d)/(e). Separate entries, separate changes.
- Changing what any command does. Every current invocation is already
  sandboxed; this makes that structural rather than incidental.

## Decisions

1. **Remove the `sandbox` option rather than defaulting it to true.** Defaulting
   (`opts.sandbox !== false`) would preserve a documented way to ask for an
   unsandboxed run, which is precisely the capability that should not exist:
   the only legitimate way to opt out is `fullAccess`, which is user-driven and
   audited. Removing the option makes the branch total — full access or
   sandbox, no third state — so the gap cannot be reintroduced by omission at a
   future call site. The four call sites drop their now-redundant
   `sandbox: true`.

   The cost is that `buildAgyArgs` can no longer express "no access flag at
   all." That is intentional; it only ever builds headless (`-p`) invocations,
   where agy cannot prompt, so sandbox-or-full-access is genuinely exhaustive.

2. **Treat an unparseable exit-code file as "no verdict yet", not as failure.**
   The status file answers the question "how did it end"; a file that does not
   yet contain an integer has not answered it. Falling through to the liveness
   check is correct in both directions: mid-write, the wrapper process is still
   alive, so the job reads as `running`; if the process died between creating
   the file and writing to it, it is dead with no recorded status, which is
   `failed` by the existing rule.

   Alternatives rejected: retry-with-sleep inside `jobState()` (turns a pure
   read into a blocking one, and `jobState` is called in a loop by `listJobs`),
   and having the wrapper write to a temp file and rename atomically (correct,
   but changes the on-disk contract and cannot fix job directories written by
   an older version).

3. **Validate with `Number.isInteger` on the trimmed contents.** Guards the
   empty string, partial writes, and any non-numeric garbage in one check.
   `parseInt` is deliberately avoided: it returns `0` for `"0abc"` and would
   report a garbage file as success.

4. **Deterministic tests, by constructing the state rather than racing it.**
   The window is microseconds; a test that tries to hit it by timing would be
   flaky and would pass for the wrong reasons. Instead the tests write an empty
   `exit-code` file next to a meta whose pid is a known-live process
   (`process.pid`), assert `running`, then write `0` and assert `done`. The
   sandbox test simply calls `buildAgyArgs({ prompt })` with no access options —
   the call shape that was silently unsafe.

## Risks

- **Removing an option is a breaking change to an internal function.** It is
  not exported beyond the plugin's own scripts, and all four call sites are
  updated in this change. `tests/agy.test.mjs` passes `sandbox: true` in one
  case and omits it in another; both are updated, and the omitting case becomes
  the assertion that the default is safe.
- **`jobState` returning `running` for a corrupt exit-code file.** If a file
  were permanently garbage and the process long dead, the state is `failed`
  (pid not alive), not a stuck `running`. A permanently-garbage file with a
  live pid would read `running`, which is the correct answer for "the process
  is alive and has not reported a status."

# Tasks: fix-cancel-race-and-session-input

## 1. Regression tests (written first, expected to fail)

- [x] 1.1 In `tests/jobs.test.mjs`, stage a job whose wrapper ignores SIGTERM
      and completes successfully, cancel it, and assert the result is `done`
      with exit code 0 and its output intact — not `cancelled`
- [x] 1.2 Assert the unchanged path still holds: a job that does not record a
      status during the grace period is marked `cancelled`
- [x] 1.3 In `tests/session-hook.test.mjs`, feed a payload whose `session_id`
      contains `../../` and assert nothing is written inside or outside the
      sessions directory, and the hook still exits 0
- [x] 1.4 In `tests/transcript.test.mjs`, assert an unsafe `CLAUDE_SESSION_ID`
      is ignored by the lookup rather than used to build a path
- [x] 1.5 In `tests/transcript.test.mjs`, assert a transcript of multi-byte
      characters is bounded by the budget measured with `Buffer.byteLength`
- [x] 1.6 Run the affected files and confirm the new assertions fail

## 2. Implementation

- [x] 2.1 In `lib/jobs.mjs`, re-read the exit status after the grace wait in
      `cancelJob()`; when one is recorded, return the derived terminal state
      without writing `cancelled`
- [x] 2.2 In `lib/transcript.mjs`, add and export a safe-session-id predicate
      beside `latestSession()`, and apply it to the `CLAUDE_SESSION_ID`
      shortcut
- [x] 2.3 In `session-hook.mjs`, apply the same predicate before writing, so
      writer and reader share one definition
- [x] 2.4 In `lib/transcript.mjs`, measure the extraction budget with
      `Buffer.byteLength(text, 'utf8')` in both the initial total and the
      drop loop

## 3. Verify

- [x] 3.1 Full suite green
- [x] 3.2 Re-run the audit probes and confirm the cancel race and the path
      traversal no longer reproduce, and that the byte budget now holds
- [x] 3.3 Confirm against real agy that cancelling a genuinely running job
      still reports `cancelled` and leaves no surviving process
- [x] 3.4 Remove the three fixed entries from `docs/known-issues.md`

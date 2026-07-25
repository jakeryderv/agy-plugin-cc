# Tasks: harden-sandbox-default-and-job-state

## 1. Regression tests (written first, expected to fail)

- [x] 1.1 In `tests/agy.test.mjs`, assert that `buildAgyArgs({ prompt })` with
      no access option supplied includes the sandbox flag, and that the
      full-access form still excludes it
- [x] 1.2 In `tests/jobs.test.mjs`, construct a job directory with a valid meta
      whose pid is a known-live process and an empty `exit-code` file, and
      assert `jobState()` returns `running`; then write `0` and assert `done`
- [x] 1.3 In the same test, assert `jobResult()` reports no exit code while the
      file is empty, and `0` once written
- [x] 1.4 Assert a job whose `exit-code` file holds no complete integer and
      whose process is dead reports `failed`
- [x] 1.5 Run both files and confirm the new assertions fail against current
      code (unsandboxed args; `failed` for a live job mid-write)

## 2. Implementation

- [x] 2.1 In `lib/agy.mjs`, make the access branch total: full access emits the
      skip-permissions flag, every other case emits the sandbox flag. Remove
      the `sandbox` option
- [x] 2.2 Update the four call sites (`cmdRun`, `cmdReview`, `cmdTransfer`,
      `startJob`) to drop the now-removed `sandbox: true` argument
- [x] 2.3 In `lib/jobs.mjs`, add a single helper that reads the `exit-code`
      file and returns an integer or nothing, validating with
      `Number.isInteger` on the trimmed contents rather than `parseInt`
- [x] 2.4 Use it in `jobState()` so an unreadable status falls through to the
      liveness check, and in `jobResult()` so the reported exit code is absent
      rather than non-numeric

## 3. Verify

- [x] 3.1 Full suite green
- [x] 3.2 Grep the plugin for any remaining `sandbox:` argument to confirm no
      call site still passes the removed option
- [x] 3.3 Confirm against a real background job that a completed run reports
      `done` with exit code 0, and that a review still runs sandboxed
- [x] 3.4 Remove ledger entry (b) and the `buildAgyArgs` hazard from
      `docs/known-issues.md`

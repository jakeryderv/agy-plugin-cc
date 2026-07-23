# Tasks: prune-corrupt-job-dirs

## 1. Regression test (written first, expected to fail)

- [x] 1.1 In `tests/jobs.test.mjs`, add a test that creates a job dir with unparseable `meta.json` and one with no `meta.json`, backdates both past the grace period with `utimesSync`, and asserts `listJobs()` deletes both and omits them from results
- [x] 1.2 In the same test, create a fresh meta-less dir (not backdated) and a normal valid job, and assert the fresh dir survives and the valid job is listed intact
- [x] 1.3 Run `node --test tests/jobs.test.mjs` and confirm the new test fails against current code (corrupt dirs survive)

## 2. Implementation

- [x] 2.1 In `plugins/agy/scripts/lib/jobs.mjs`, add a module-level grace-period constant (1 hour) and, in `listJobs()`'s catch branch, `statSync` the entry and `rmSync(..., { recursive: true, force: true })` it when its mtime is older than the grace period, wrapping stat+rm in try/catch so failures fall through to `continue`

## 3. Verify

- [x] 3.1 Run the full suite (`node --test tests/`) and confirm all tests pass on the local Node version
- [x] 3.2 Update `.superpowers/sdd/progress.md` ledger to mark known issue (a) resolved (pointer to this change)

## 4. Review hardening (agy review findings)

- [x] 4.1 Gate pruning on error type: only `UsageError` (missing meta) or `SyntaxError` (unparseable meta) triggers deletion, so transient fs read errors cannot delete a valid job
- [x] 4.2 Gate pruning on `isDirectory()` so stray files in the jobs root are spared; extend the regression test with a backdated stray file that must survive

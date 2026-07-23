# Design: prune-corrupt-job-dirs

## Context

`plugins/agy/scripts/lib/jobs.mjs` stores each background job under `<stateDir>/jobs/<id>/` with a `meta.json`. `listJobs()` iterates the jobs root, parses each meta via `getJob(id)`, prunes dirs older than 7 days, and returns the rest. When `getJob` throws (missing or unparseable `meta.json`), the `catch { continue; }` at `jobs.mjs:94-96` skips the entry entirely — it never reaches the age check, so it is never deleted. This is known issue (a) in `.superpowers/sdd/progress.md`.

One legitimate reason a dir can briefly lack `meta.json`: `startJob()` calls `mkdirSync(dir)` and only writes `meta.json` after spawning the child (`jobs.mjs:24-54`). A concurrent `listJobs()` in that window must not delete the dir.

## Goals / Non-Goals

**Goals:**
- Corrupt- or missing-meta job directories are eventually removed by `listJobs()`.
- A job mid-startup is never deleted.
- Regression test in `tests/jobs.test.mjs`.

**Non-Goals:**
- Recovering data from corrupt metas (they carry nothing worth salvaging).
- Fixing the other deferred issues (b), (c) from the ledger.
- A separate cleanup command or scheduled sweep; `listJobs()` remains the only prune point.

## Decisions

1. **Prune in the existing `catch` branch, gated on error type, entry kind, and directory age.** In `listJobs()`, when `getJob(id)` throws `UsageError` (missing meta) or `SyntaxError` (unparseable meta) — the only two errors that prove the meta is garbage; a transient fs error (e.g. `EMFILE` mid-read) must not delete a valid job — stat the entry (`statSync(jobDir(id))`) and delete it with `rmSync(..., { recursive: true, force: true })` only if it `isDirectory()` (a stray file like `.DS_Store` in the jobs root is not a job and is left alone) and its `mtimeMs` is older than a grace period. Alternative considered: prune unconditionally — rejected because of the `startJob` race above.

2. **Grace period: 1 hour, module-level constant.** Vastly larger than the milliseconds-wide startup window, small enough that garbage disappears on the next status call after an hour. Reusing the 7-day cutoff was considered but rejected: `mtime` of a corrupt dir can keep refreshing, and a week of survival for known garbage is needless; 1 hour is safe by orders of magnitude.

3. **Use directory `mtime` (via `statSync`) as the age signal.** `createdAt` is unavailable (the meta is exactly what's unreadable). `birthtime` is not reliable on all Linux filesystems; `mtime` is, and a dir whose meta never appears stops being modified immediately.

4. **Wrap the stat+rm in its own try/catch.** A vanished or undeletable entry must not break listing (spec: "Pruning failures do not break listing"). Mirrors the `force: true` spirit of the existing prune.

5. **Test approach: real fs fixtures in the temp `AGY_PLUGIN_STATE_DIR`.** Create a fake job dir with garbage `meta.json`, backdate it with `utimesSync`, assert `listJobs()` removes it; create a fresh meta-less dir, assert it survives; assert a valid running/done job is unaffected. No new test file — extend `tests/jobs.test.mjs`, matching the existing prune test at line 73.

## Risks / Trade-offs

- [A stalled `startJob` that never writes meta within the grace period loses its dir] → acceptable: if meta was never written after 1 hour, the job is unusable garbage by definition; the detached child keeps its own log fds until it exits.
- [`utimesSync` backdating in tests could behave oddly on exotic filesystems] → CI runs standard Linux ext4/tmpfs on Node 18 and 24; the same technique is conventional in Node test suites.

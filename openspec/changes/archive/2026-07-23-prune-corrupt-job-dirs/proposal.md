# Proposal: prune-corrupt-job-dirs

## Why

Known issue (a) in `.superpowers/sdd/progress.md`: `listJobs()` silently skips any job directory whose `meta.json` is missing or unparseable, but the age-based prune only runs on directories whose meta parses. A corrupt-meta job directory is therefore never cleaned up and survives in `~/.agy-plugin/jobs/` forever, accumulating garbage state.

## What Changes

- `listJobs()` prunes job directories with missing/corrupt `meta.json` instead of skipping them, subject to a grace period so a directory in the brief window between `mkdirSync` and the `meta.json` write during `startJob()` is not deleted out from under a starting job.
- Regression test covering: a corrupt-meta directory older than the grace period is removed; a freshly created meta-less directory is left alone; valid jobs are unaffected.

## Capabilities

### New Capabilities

- `job-cleanup`: Pruning of stale background-job state directories — age-based expiry of completed jobs and removal of unreadable (corrupt/missing meta) job directories.

### Modified Capabilities

(none — no existing specs)

## Impact

- `plugins/agy/scripts/lib/jobs.mjs` (`listJobs`)
- `tests/jobs.test.mjs` (new regression test)
- No plugin surface (commands/agents/hooks markdown) changes; no behavior change for valid jobs.

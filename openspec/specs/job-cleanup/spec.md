# job-cleanup

## Purpose

Pruning of stale background-job state directories under `<stateDir>/jobs/` — age-based expiry of completed jobs and removal of unreadable (corrupt/missing meta) job directories. `listJobs()` is the only prune point; there is no separate cleanup command or scheduled sweep.

## Requirements

### Requirement: Aged job directories are pruned
`listJobs()` SHALL delete any job directory whose `meta.json` parses and whose `createdAt` is older than 7 days, and SHALL exclude it from results.

#### Scenario: Ancient job removed
- **WHEN** `listJobs()` runs and a job directory has a valid `meta.json` with `createdAt` more than 7 days in the past
- **THEN** the directory is deleted and the job does not appear in the returned list

### Requirement: Corrupt-meta job directories are pruned after a grace period
`listJobs()` SHALL delete any directory under the jobs root whose `meta.json` is missing or unparseable, provided the directory is older than a short grace period. The grace period MUST be long enough to cover the window in `startJob()` between directory creation and the `meta.json` write, so a job that is mid-startup is never deleted. Only a missing or unparseable meta SHALL trigger pruning — other read failures (e.g. transient fs errors) MUST NOT — and non-directory entries in the jobs root SHALL be left in place.

#### Scenario: Corrupt meta.json pruned
- **WHEN** `listJobs()` runs and a job directory older than the grace period contains a `meta.json` that fails to parse as JSON
- **THEN** the directory is deleted and does not appear in the returned list

#### Scenario: Missing meta.json pruned
- **WHEN** `listJobs()` runs and a job directory older than the grace period contains no `meta.json`
- **THEN** the directory is deleted and does not appear in the returned list

#### Scenario: Freshly created directory spared
- **WHEN** `listJobs()` runs and a job directory without a readable `meta.json` was created within the grace period
- **THEN** the directory is left in place (and excluded from the returned list)

#### Scenario: Stray non-directory entry spared
- **WHEN** `listJobs()` runs and the jobs root contains a regular file (e.g. `.DS_Store`) older than the grace period
- **THEN** the file is left in place and does not appear in the returned list

### Requirement: Valid jobs are unaffected by pruning
Pruning SHALL NOT delete or alter any job directory with a parseable `meta.json` whose `createdAt` is within the 7-day retention window, regardless of job state.

#### Scenario: Recent valid job listed intact
- **WHEN** `listJobs()` runs and a job directory has a valid `meta.json` created within the last 7 days
- **THEN** the job appears in the returned list and its directory is untouched

### Requirement: Pruning failures do not break listing
If deleting an unreadable or expired job directory fails (e.g., permissions), `listJobs()` SHALL still return the remaining valid jobs rather than throwing.

#### Scenario: Undeletable corrupt directory skipped
- **WHEN** `listJobs()` attempts to prune a directory and the removal fails
- **THEN** `listJobs()` returns the valid jobs without raising an error

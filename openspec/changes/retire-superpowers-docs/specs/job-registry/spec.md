# job-registry

## ADDED Requirements

### Requirement: Job state lives on disk under a configurable root
Background job state SHALL live under `<stateDir>/jobs/<job-id>/`, where
`stateDir` is `AGY_PLUGIN_STATE_DIR` when set and `~/.agy-plugin` otherwise.
Each job directory holds `meta.json` (the job's immutable description),
`output.log` (combined stdout and stderr of the agy run), `agy.log` (agy's own
`--log-file` output, from which the conversation id is recovered), and
`exit-code` (written after the run finishes).

#### Scenario: Job artefacts are written to the job directory
- **WHEN** a background job runs to completion
- **THEN** its directory contains the run's output, agy's log, and the exit code

#### Scenario: State root is redirectable
- **WHEN** `AGY_PLUGIN_STATE_DIR` is set
- **THEN** all job state is read from and written under that directory, so tests never touch the user's real state

### Requirement: Jobs are identified by a collision-resistant id
`startJob()` SHALL assign each job an id combining a creation timestamp with
random suffix, so that two jobs started in the same millisecond do not collide
and ids sort by creation time.

#### Scenario: Concurrent starts get distinct ids
- **WHEN** two jobs are started in immediate succession
- **THEN** they receive different ids and both directories exist

### Requirement: Jobs run detached with their exit status recorded on disk
`startJob()` SHALL spawn the agy run detached from the companion process, in
its own process group, with output redirected to `output.log`, and SHALL
arrange for the run's exit status to be written to the `exit-code` file when it
finishes. There SHALL be no daemon or broker: completion is observable purely
from the filesystem.

#### Scenario: Companion exits without waiting
- **WHEN** `job-start` is invoked
- **THEN** it emits the job id and exits while the agy run continues

#### Scenario: Completion is visible after the companion is gone
- **WHEN** the run finishes after the starting process has exited
- **THEN** the exit status is readable from the job directory

### Requirement: Job state is derived, never stored
Job state SHALL be computed on read rather than recorded in `meta.json`, so
there is a single source of truth. The precedence SHALL be: a job marked
cancelled is `cancelled`; otherwise a present `exit-code` file gives `done` for
zero and `failed` for non-zero; otherwise a live process id gives `running`;
otherwise the job is `failed`, having died without recording a status.

#### Scenario: Cancellation outranks a recorded exit status
- **WHEN** a job's meta is marked cancelled
- **THEN** its state is `cancelled` regardless of any `exit-code` file

#### Scenario: Successful run reports done
- **WHEN** the `exit-code` file holds zero
- **THEN** the state is `done` and the result reports exit code zero

#### Scenario: Crashed job reports failed
- **WHEN** no `exit-code` file exists and the recorded process is no longer alive
- **THEN** the state is `failed`

### Requirement: Cancellation stops the whole process group
`cancelJob()` SHALL signal the job's entire process group, wait a grace period
for it to exit, and escalate to an unconditional kill if it has not, then mark
the job cancelled. It MUST NOT leave the agy process running after reporting
cancellation.

#### Scenario: Running job is stopped
- **WHEN** a running job is cancelled
- **THEN** it reports `cancelled` and no agy process from that job survives

#### Scenario: Finished job keeps its terminal state
- **WHEN** cancellation is requested for a job that has already finished
- **THEN** its existing terminal state is returned unchanged and it is not marked cancelled

### Requirement: Unknown job ids fail as usage errors
Requesting the status or result of an id with no readable `meta.json` SHALL be
a usage error that lists the known job ids, rather than a crash or an empty
result.

#### Scenario: Status of a nonexistent job
- **WHEN** `job-status` is given an id that does not exist
- **THEN** it exits 64 and lists the known job ids

### Requirement: Deletion of job state is out of scope here
This capability SHALL NOT define when job directories are removed. Retention
and pruning are governed solely by the `job-cleanup` capability, so there is
one prune contract in one place.

#### Scenario: Retention questions defer to job-cleanup
- **WHEN** a question arises about when a job directory is deleted
- **THEN** `job-cleanup` is authoritative and this capability adds no separate rule

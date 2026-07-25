# job-registry

## MODIFIED Requirements

### Requirement: Job state is derived, never stored
Job state SHALL be computed on read rather than recorded in `meta.json`, so
there is a single source of truth. The precedence SHALL be: a job marked
cancelled is `cancelled`; otherwise a recorded exit status gives `done` for
zero and `failed` for non-zero; otherwise a live process id gives `running`;
otherwise the job is `failed`, having died without recording a status.

An exit status counts as recorded only when the `exit-code` file holds a
complete integer. The file is created by shell redirection before the status is
written to it, so its mere existence SHALL NOT be read as a verdict: a file
that exists without a readable integer means the run has not reported yet, and
state SHALL fall through to the liveness check. A job that exited successfully
MUST NOT be reported as `failed` at any point in its life.

#### Scenario: Cancellation outranks a recorded exit status
- **WHEN** a job's meta is marked cancelled
- **THEN** its state is `cancelled` regardless of any `exit-code` file

#### Scenario: Successful run reports done
- **WHEN** the `exit-code` file holds zero
- **THEN** the state is `done` and the result reports exit code zero

#### Scenario: Crashed job reports failed
- **WHEN** no `exit-code` file exists and the recorded process is no longer alive
- **THEN** the state is `failed`

#### Scenario: Exit-code file created but not yet written
- **WHEN** the `exit-code` file exists but is empty or holds no complete integer, and the job's process is still alive
- **THEN** the state is `running`, not `failed`

#### Scenario: Process died without recording a status
- **WHEN** the `exit-code` file exists but holds no complete integer, and the job's process is no longer alive
- **THEN** the state is `failed`

#### Scenario: Result reports no exit code rather than a nonsense one
- **WHEN** a job's result is requested while its `exit-code` file holds no complete integer
- **THEN** the reported exit code is absent rather than a non-numeric value

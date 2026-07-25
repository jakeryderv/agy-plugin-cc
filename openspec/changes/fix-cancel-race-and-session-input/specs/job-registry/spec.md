# job-registry

## MODIFIED Requirements

### Requirement: Cancellation stops the whole process group
`cancelJob()` SHALL signal the job's entire process group, wait a grace period
for it to exit, and escalate to an unconditional kill if it has not. It MUST
NOT leave the agy process running after reporting cancellation.

A job SHALL be marked cancelled only if it did not finish under its own power.
After the grace period, if the job has recorded an exit status, that status
SHALL be reported as its terminal state and the job MUST NOT be marked
cancelled — a signalled wrapper records no status, so a recorded one is
evidence the job completed on its own. Marking such a job cancelled would
persist a wrong terminal state permanently and hide its output.

#### Scenario: Running job is stopped
- **WHEN** a running job is cancelled
- **THEN** it reports `cancelled` and no agy process from that job survives

#### Scenario: Finished job keeps its terminal state
- **WHEN** cancellation is requested for a job that has already finished
- **THEN** its existing terminal state is returned unchanged and it is not marked cancelled

#### Scenario: Job completes during cancellation
- **WHEN** a job records a successful exit status between the state check and the end of the grace period
- **THEN** it reports `done` with its exit code and output intact, and is not marked cancelled

#### Scenario: Job that could not be signalled away is cancelled
- **WHEN** the grace period ends with no exit status recorded
- **THEN** the job is marked cancelled and reports `cancelled`

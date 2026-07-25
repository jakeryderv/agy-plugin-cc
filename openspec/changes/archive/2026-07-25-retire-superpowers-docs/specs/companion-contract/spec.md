# companion-contract

## ADDED Requirements

### Requirement: Single entrypoint with subcommand dispatch
Every `/agy:*` command SHALL reach the plugin through
`scripts/agy-companion.mjs <subcommand>`. The recognised subcommands are
`setup`, `models`, `run`, `review`, `job-start`, `job-status`, `job-result`,
`job-cancel`, and `transfer`. An unrecognised or missing subcommand SHALL be a
usage error naming the known subcommands.

#### Scenario: Unknown subcommand is rejected
- **WHEN** the companion is invoked with a subcommand that is not in the list
- **THEN** it exits 64 and the message names the known subcommands

### Requirement: Exit codes are a stable interface
The companion SHALL use exit code 0 for success, 1 for a runtime failure, 64
for a usage error, and 127 when the agy binary cannot be found. Commands that
stream agy's output SHALL propagate agy's own exit status.

#### Scenario: Usage error exits 64
- **WHEN** a subcommand is given an unknown flag, a missing required value, an unknown model, an invalid effort, or an unknown job id
- **THEN** the companion exits 64 and writes the reason to stderr

#### Scenario: Missing agy exits 127
- **WHEN** a subcommand that needs the agy binary runs and no binary can be located
- **THEN** the companion exits 127 and writes install guidance to stderr

### Requirement: Structured and streamed output modes are distinct
Subcommands that return data — `setup`, `job-start`, `job-status`,
`job-result`, `job-cancel`, `transfer` — SHALL write exactly one JSON object to
stdout. Subcommands that front an interactive agy run — `run`, `review`,
`models` — SHALL pass agy's output through verbatim and MUST NOT wrap or
reformat it.

#### Scenario: Job status returns parseable JSON
- **WHEN** `job-status` runs
- **THEN** stdout is a single JSON object and nothing else

#### Scenario: Model listing is passed through unmodified
- **WHEN** `models` runs
- **THEN** agy's listing reaches stdout unaltered, so the plugin cannot present a stale or filtered set of models

### Requirement: Argument parsing rejects malformed input
`parseArgs()` SHALL accept `--flag`, `--flag value`, and `--flag=value` forms,
SHALL treat everything after a bare `--` as positional, and SHALL raise a usage
error for an unknown flag, a value flag with no value, or a boolean flag given
a value.

#### Scenario: Unknown flag is rejected
- **WHEN** an argument list contains a flag absent from the subcommand's spec
- **THEN** parsing raises a usage error naming that flag

#### Scenario: Value flag with no value is rejected
- **WHEN** a value-taking flag appears last, or is given an empty value
- **THEN** parsing raises a usage error stating the flag requires a value

### Requirement: Model and effort values are validated before agy is invoked
A `--model` value SHALL be validated against the live `agy models` listing, and
an unknown value SHALL fail with the available models printed. A `--effort`
value SHALL be one of `low`, `medium`, or `high`. Model names MUST NOT be
hardcoded in plugin logic.

#### Scenario: Unknown model reports the live list
- **WHEN** a task subcommand is given a model name absent from the live listing
- **THEN** it exits 64 and prints the available model names

#### Scenario: Model listing unavailable does not block the run
- **WHEN** `agy models` fails, so no listing can be obtained
- **THEN** validation accepts the supplied model and lets agy report the problem, rather than blocking on an availability outage

### Requirement: The agy binary is located predictably
`findAgy()` SHALL resolve the binary from `AGY_BIN` when that variable is set,
using it only if it exists; otherwise by scanning `PATH`; otherwise from a
short list of known install locations. When `AGY_BIN` is set but missing, no
fallback SHALL be attempted, so tests cannot accidentally reach a real agy.

#### Scenario: AGY_BIN pins the binary
- **WHEN** `AGY_BIN` points at an existing file
- **THEN** that path is used and `PATH` is not consulted

#### Scenario: AGY_BIN set but absent resolves to nothing
- **WHEN** `AGY_BIN` is set to a path that does not exist
- **THEN** resolution returns nothing rather than falling back to a binary on `PATH`

### Requirement: Setup reports readiness reconciled with observed behaviour
`setup` SHALL report whether agy is available, its version, an auth status, and
whether a model listing could be obtained, and SHALL treat a working model
listing as proof of authentication. When the listing works but no credential
location was found on disk, the reported auth status SHALL reflect that
credentials are held elsewhere rather than reporting them missing.

#### Scenario: Working listing overrides a missing-credential guess
- **WHEN** no credential file or API key is found but `agy models` returns a listing
- **THEN** setup reports ready, with auth working and its status given as held in a keyring rather than missing

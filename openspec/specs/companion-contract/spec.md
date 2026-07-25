# companion-contract

## Purpose

The interface `plugins/agy/scripts/agy-companion.mjs` presents to the slash
commands: its subcommand surface, when it speaks JSON versus passing agy's
output through untouched, its exit-code table, how it parses arguments, how it
locates the agy binary, and how it validates model and effort values. Every
`/agy:*` command reaches agy through this one entrypoint, so this is the
contract the markdown command surface is written against.

## Requirements
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

`--model` and `--effort` SHALL NOT be accepted together. agy encodes the effort
tier in the model name for the models that support tiering, and rejects the
flag outright for those that do not, so no combination of the two can succeed.
Supplying both SHALL be a usage error that states they are alternatives, raised
before agy is invoked so no live call is spent on an invocation that cannot
work.

#### Scenario: Unknown model reports the live list
- **WHEN** a task subcommand is given a model name absent from the live listing
- **THEN** it exits 64 and prints the available model names

#### Scenario: Model listing unavailable does not block the run
- **WHEN** `agy models` fails, so no listing can be obtained
- **THEN** validation accepts the supplied model and lets agy report the problem, rather than blocking on an availability outage

#### Scenario: Model and effort together are rejected
- **WHEN** a task subcommand is given both a model and an effort
- **THEN** it exits 64 explaining that the two are alternatives, and agy is never invoked

#### Scenario: Either flag alone is accepted
- **WHEN** a task subcommand is given a valid model without an effort, or an effort without a model
- **THEN** validation passes and the run proceeds

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

### Requirement: Review distinguishes its precondition failures
Before invoking agy, review SHALL establish that it is running inside a git
work tree and that there is a diff to review, and SHALL report each failing
condition by its actual cause rather than by a shared message. Being outside a
git work tree MUST NOT be reported as an absence of changes. Every precondition
failure SHALL exit 1, since the command itself was well-formed.

#### Scenario: Not inside a git work tree
- **WHEN** review runs from a directory that is not inside a git work tree
- **THEN** it exits 1 stating that, and does not claim the working tree has no changes

#### Scenario: Work tree with no changes
- **WHEN** review runs inside a git work tree that has no diff
- **THEN** it exits 1 stating there is nothing to review

### Requirement: A diff too large to pass to agy is reported actionably
agy accepts a prompt only as a command-line argument, so a diff beyond the
platform's per-argument limit cannot be delivered. Review SHALL detect this
condition from the failed spawn rather than by comparing the diff against a
built-in threshold, because that limit differs by platform and a fixed
threshold would refuse diffs a platform can accept.

On detecting it, review SHALL report the total diff size, a per-file breakdown
ordered by size, and a narrower invocation that would fit. It MUST NOT classify
files by kind — for example as generated or vendored — since misjudging that
would steer the reviewer away from a file that mattered. Review MUST NOT
silently review part of an oversized diff.

#### Scenario: Oversized diff is explained
- **WHEN** the prompt built from the diff exceeds what the platform accepts as a single argument, and the spawn fails for that reason
- **THEN** review exits 1 reporting the diff's size, the per-file sizes, and a narrower command that fits, and does not surface the raw spawn error alone

#### Scenario: No partial review is performed
- **WHEN** a diff is too large to pass in full
- **THEN** no review of a truncated or partial diff is run, so a result can never appear complete when it is not

#### Scenario: A diff that fits is unaffected
- **WHEN** the prompt fits within the platform's limit
- **THEN** review proceeds exactly as before, with no size reported and no change to the prompt

### Requirement: Review defers its network-dependent validation
Review SHALL complete every local precondition check before performing any
validation that requires invoking agy, so that a condition detectable on the
local machine never costs a live call. Validation that is itself local — the
mutual exclusion of model and effort, and the effort value — SHALL remain
early, so a malformed command still fails immediately.

#### Scenario: Empty diff is not paid for with a model listing
- **WHEN** review is given an unknown model in a work tree with no changes
- **THEN** it reports the absence of changes without having invoked agy to list models

#### Scenario: Malformed flags still fail immediately
- **WHEN** review is given both a model and an effort, or an invalid effort value
- **THEN** it exits 64 for that usage error without first computing a diff


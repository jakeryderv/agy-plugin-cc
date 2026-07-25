# companion-contract

## ADDED Requirements

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

# sandbox-safety

## Purpose

The invariants governing how the plugin invokes agy and what it is permitted to
touch. Every agy run the plugin makes is headless (`-p`), where agy cannot
prompt for permission — so the sandbox decision is made entirely by this code,
on the user's behalf, with no chance for them to intervene mid-run. These are
therefore the requirements least amenable to convenience trade-offs.

Note that `docs/known-issues.md` records a latent hazard here: `buildAgyArgs()`
does not itself enforce the default — the invariant currently holds because
every call site passes `sandbox: true`.

## Requirements
### Requirement: Headless agy runs are sandboxed unless full access is explicitly requested
Every agy invocation the plugin makes runs headless (`-p`), where agy cannot
prompt for permission. Each such invocation SHALL therefore carry either
agy's sandbox flag or its skip-permissions flag, and SHALL default to the
sandbox. The permissive mode SHALL be selected only when the user explicitly
asked for it; the plugin MUST NOT add it on its own initiative, infer it from
the task text, or retry with it after a sandboxed run fails.

#### Scenario: Delegation defaults to sandboxed
- **WHEN** a task is delegated with no access flag
- **THEN** agy is invoked with the sandbox flag

#### Scenario: Full access is user-selected only
- **WHEN** the user passes the full-access flag
- **THEN** agy is invoked with the skip-permissions flag instead of the sandbox flag, and this is the only way that flag is ever set

#### Scenario: A sandboxed failure is not retried with full access
- **WHEN** a sandboxed run fails in a way that full access might have avoided
- **THEN** the failure is reported and no escalated retry is attempted

### Requirement: Review commands are always sandboxed
`/agy:review` and `/agy:adversarial-review` SHALL always run sandboxed,
regardless of any access flag, because the diff is embedded in the prompt and
agy needs no write access to perform the review.

#### Scenario: Review ignores a full-access request
- **WHEN** review runs
- **THEN** agy is invoked with the sandbox flag and never with skip-permissions

### Requirement: The plugin never handles agy credentials
The plugin SHALL NOT read, write, copy, or transmit agy credentials. It
detects only whether credentials appear to be present, and otherwise relies
entirely on the local agy binary's own authentication.

#### Scenario: Auth detection does not read secrets
- **WHEN** setup determines auth status
- **THEN** it checks for the presence of an API key variable or credential location without reading credential contents

### Requirement: Only the local agy binary is invoked
The plugin SHALL execute only the user's local agy binary, git, and its own
Node scripts. The single external URL it knows — agy's official installer —
SHALL be run only after the user explicitly consents.

#### Scenario: Installer requires consent
- **WHEN** setup finds no agy binary
- **THEN** it offers to run the official installer and does so only if the user accepts

### Requirement: A run's prompt carries only what the command intends
Each command SHALL send agy only the content that command is defined to send —
a review sends the working-tree diff, a transfer sends the session transcript
turns, a delegation sends the task text. No command SHALL silently include
other repository or environment content.

#### Scenario: Review sends the diff, not the repository
- **WHEN** review runs
- **THEN** the prompt contains the working-tree diff and the reviewer's focus, and no other file contents


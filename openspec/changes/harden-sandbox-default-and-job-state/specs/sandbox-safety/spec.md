# sandbox-safety

## MODIFIED Requirements

### Requirement: Headless agy runs are sandboxed unless full access is explicitly requested
Every agy invocation the plugin makes runs headless (`-p`), where agy cannot
prompt for permission. Each such invocation SHALL therefore carry either
agy's sandbox flag or its skip-permissions flag, and SHALL default to the
sandbox. The permissive mode SHALL be selected only when the user explicitly
asked for it; the plugin MUST NOT add it on its own initiative, infer it from
the task text, or retry with it after a sandboxed run fails.

This default SHALL be enforced where agy's arguments are constructed, not by
the callers that construct them. The argument builder SHALL treat access mode
as a total choice between full access and sandbox, with no third state, so that
omitting an option cannot produce an unsandboxed run.

#### Scenario: Delegation defaults to sandboxed
- **WHEN** a task is delegated with no access flag
- **THEN** agy is invoked with the sandbox flag

#### Scenario: Full access is user-selected only
- **WHEN** the user passes the full-access flag
- **THEN** agy is invoked with the skip-permissions flag instead of the sandbox flag, and this is the only way that flag is ever set

#### Scenario: A sandboxed failure is not retried with full access
- **WHEN** a sandboxed run fails in a way that full access might have avoided
- **THEN** the failure is reported and no escalated retry is attempted

#### Scenario: Omitting every access option still sandboxes
- **WHEN** agy arguments are built with no access option supplied at all
- **THEN** the sandbox flag is present, and there is no combination of inputs other than an explicit full-access request that yields an invocation carrying neither flag

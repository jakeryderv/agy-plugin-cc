# conversation-id

## Purpose

Recovery of the agy conversation id from the log agy writes via `--log-file`,
and the contract for how commands consume it. Scraping the log is the only
channel agy 1.1.7 offers in print mode; `extractConversationId()` in
`plugins/agy/scripts/lib/jobs.mjs` is the single implementation, consumed by
`/agy:result`, `/agy:transfer`, and (via a user-pasted id) `/agy:resume`. The
format is anchored to a verbatim real-log fixture in `tests/jobs.test.mjs`.

## Requirements

### Requirement: Conversation ids are recovered from real agy log output
`extractConversationId(text)` SHALL return the conversation id that agy records
in its `--log-file` output. agy writes the id as a canonical 8-4-4-4-12 hex
UUID on lines that mention `conversation`, in both `conversation <uuid>` and
`conversation=<uuid>` forms.

#### Scenario: Id recovered from a real log
- **WHEN** `extractConversationId()` is given agy log text containing
  `Created conversation 64bb96ef-8a49-4c85-9d5b-c321f9ee6512`
- **THEN** it returns `64bb96ef-8a49-4c85-9d5b-c321f9ee6512`

#### Scenario: Id recovered from the print-mode form
- **WHEN** the log contains `Print mode: conversation=64bb96ef-8a49-4c85-9d5b-c321f9ee6512, sending message`
- **THEN** it returns `64bb96ef-8a49-4c85-9d5b-c321f9ee6512`

### Requirement: Only well-formed ids are returned
`extractConversationId()` SHALL return only values matching the canonical UUID
shape, and SHALL return `null` when the log contains no such value. It MUST NOT
return a token that merely follows the word `conversation`; in particular a
match on one line MUST NOT capture a token from another line.

#### Scenario: Empty conversationID decoy does not yield a false id
- **WHEN** the log contains `Print mode: starting (model="x", conversationID="")` immediately followed by a line beginning with the glog prefix `I0725`
- **THEN** `extractConversationId()` does not return `I0725`

#### Scenario: No conversation id present
- **WHEN** the log contains no UUID on any line mentioning `conversation`
- **THEN** `extractConversationId()` returns `null`

#### Scenario: Empty input
- **WHEN** `extractConversationId()` is given an empty string
- **THEN** it returns `null`

### Requirement: The most recently referenced conversation wins
When a log references more than one conversation UUID, `extractConversationId()`
SHALL return the last one encountered, so a run that switched threads resolves
to the thread it ended on.

#### Scenario: Two conversations in one log
- **WHEN** the log references conversation A and later conversation B
- **THEN** `extractConversationId()` returns B

### Requirement: Resume accepts an id in agy's real format
`/agy:resume` SHALL treat its first argument token as a conversation id when
that token matches the canonical UUID shape, and SHALL otherwise treat the
whole argument string as follow-up text for the most recent conversation. The
instruction MUST NOT rely on an id prefix such as `conv`, which agy does not
produce.

#### Scenario: Pasted real id is used as the conversation
- **WHEN** the user runs `/agy:resume 64bb96ef-8a49-4c85-9d5b-c321f9ee6512 add tests`
- **THEN** the companion is invoked with `--conversation 64bb96ef-8a49-4c85-9d5b-c321f9ee6512` and the follow-up `add tests`

#### Scenario: Prose first token continues the latest conversation
- **WHEN** the user runs `/agy:resume now add tests`
- **THEN** the companion is invoked with `--continue` and the full text as the follow-up

### Requirement: A missing id is reported honestly
Commands that surface a recovered id SHALL handle a `null` id by telling the
user no resumable id was found, rather than presenting a placeholder or an
unusable resume command.

#### Scenario: Transfer without a recoverable id
- **WHEN** `/agy:transfer` succeeds but `conversationId` is `null`
- **THEN** the user is told the transfer landed and that no resumable id was recovered, instead of being given a `/agy:resume <null>` command


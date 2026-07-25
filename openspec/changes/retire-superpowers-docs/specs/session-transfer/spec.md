# session-transfer

## ADDED Requirements

### Requirement: A SessionStart hook records each session's transcript location
The plugin SHALL register exactly one hook, on SessionStart, which reads the
hook payload from stdin and writes `<stateDir>/sessions/<session-id>.json`
recording the session id, transcript path, working directory, and the time it
was written. The recorded time is load-bearing: session lookup orders by it.

#### Scenario: Session pointer is written
- **WHEN** a session starts and the payload carries a session id and transcript path
- **THEN** a session file is written recording the transcript path, the working directory, and the write time

### Requirement: The hook can never block session startup
The hook SHALL exit 0 under all circumstances — malformed input, a payload
missing required fields, or an unreadable state directory — and SHALL write
nothing when the payload is unusable. A failure to record a transcript must
degrade `/agy:transfer`, never a user's session.

#### Scenario: Malformed payload is survivable
- **WHEN** the hook receives input that is not valid JSON
- **THEN** it exits 0 and writes no session file

#### Scenario: Payload without a session id is survivable
- **WHEN** the payload parses but carries no session id
- **THEN** it exits 0 and writes no session file

### Requirement: Session lookup prefers the current session and never crosses projects
`latestSession(cwd)` SHALL return the session identified by `CLAUDE_SESSION_ID`
when that file exists and parses; otherwise the most recently recorded session
whose working directory equals `cwd`. When no recorded session matches `cwd` it
SHALL return nothing, so a transfer can never hand another project's
conversation to agy.

#### Scenario: Environment-identified session wins
- **WHEN** `CLAUDE_SESSION_ID` names an existing, parseable session file
- **THEN** that session is returned without scanning the others

#### Scenario: Corrupt environment-identified file falls through
- **WHEN** `CLAUDE_SESSION_ID` names a file that does not parse
- **THEN** lookup falls through to the scan rather than failing

#### Scenario: No session for this directory
- **WHEN** sessions exist but none has a working directory equal to `cwd`
- **THEN** nothing is returned, and transfer reports that no session is known instead of using another project's session

### Requirement: Transcript extraction keeps conversational text and drops tool noise
`extractTurns()` SHALL read the transcript JSONL and keep only user and
assistant entries carrying text, concatenating multi-block text content and
discarding tool calls, tool results, and entries with no text. Unparseable
lines SHALL be skipped rather than aborting extraction.

#### Scenario: Tool traffic is excluded
- **WHEN** a transcript contains user turns, assistant turns, and tool-use entries
- **THEN** only the user and assistant text turns are extracted

#### Scenario: Corrupt lines are skipped
- **WHEN** a transcript line is not valid JSON
- **THEN** it is ignored and the remaining turns are still extracted

### Requirement: Extraction is bounded by turn count and size
Extraction SHALL keep at most a bounded number of the most recent turns, and
SHALL further drop turns from the oldest end while the retained text exceeds a
size budget, always retaining at least one turn. Bounds exist so a long session
cannot produce an unbounded prompt.

#### Scenario: Oldest turns are dropped first
- **WHEN** the retained turns exceed the size budget
- **THEN** turns are discarded from the oldest end until the budget is met, and the most recent turn is always kept

### Requirement: The handoff prompt transfers context without transferring initiative
`buildHandoffPrompt()` SHALL produce a prompt that states the assistant is
taking over a session, gives the working directory, embeds the transcript
within explicit delimiters, and instructs the recipient to acknowledge the
context and then wait for the user rather than acting.

#### Scenario: Recipient is told to wait
- **WHEN** a handoff prompt is built
- **THEN** it instructs the recipient to acknowledge the context and take no action until the user's next message

### Requirement: Transfer requires a recorded session
`/agy:transfer` SHALL fail with actionable guidance, and without invoking agy,
when no session transcript is known or the recorded transcript has no
transferable turns.

#### Scenario: No session recorded
- **WHEN** transfer runs and no session file matches the working directory
- **THEN** it exits non-zero explaining that the SessionStart hook records transcripts and a fresh session is needed, without calling agy

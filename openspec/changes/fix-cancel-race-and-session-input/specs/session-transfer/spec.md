# session-transfer

## MODIFIED Requirements

### Requirement: A SessionStart hook records each session's transcript location
The plugin SHALL register exactly one hook, on SessionStart, which reads the
hook payload from stdin and writes `<stateDir>/sessions/<session-id>.json`
recording the session id, transcript path, working directory, and the time it
was written. The recorded time is load-bearing: session lookup orders by it.

A session id SHALL be used as a filename only if it is already a safe one —
non-empty, free of path separators, and not a relative-path component. An id
failing that test SHALL be refused rather than rewritten into a safe form, so
that the component writing a session file and the component reading it can
never disagree about which file a session occupies. Nothing SHALL be written
outside `<stateDir>/sessions/`.

#### Scenario: Session pointer is written
- **WHEN** a session starts and the payload carries a session id and transcript path
- **THEN** a session file is written recording the transcript path, the working directory, and the write time

#### Scenario: Path-traversing id is refused
- **WHEN** the payload's session id contains path separators or relative-path components
- **THEN** no file is written anywhere, in particular none outside the sessions directory, and the hook still exits 0

### Requirement: Session lookup prefers the current session and never crosses projects
`latestSession(cwd)` SHALL return the session identified by `CLAUDE_SESSION_ID`
when that file exists and parses; otherwise the most recently recorded session
whose working directory equals `cwd`. When no recorded session matches `cwd` it
SHALL return nothing, so a transfer can never hand another project's
conversation to agy.

The identified-session shortcut SHALL apply the same safe-filename test as the
writer, so a hostile or malformed value in the environment cannot cause a read
outside the sessions directory.

#### Scenario: Environment-identified session wins
- **WHEN** `CLAUDE_SESSION_ID` names an existing, parseable session file
- **THEN** that session is returned without scanning the others

#### Scenario: Corrupt environment-identified file falls through
- **WHEN** `CLAUDE_SESSION_ID` names a file that does not parse
- **THEN** lookup falls through to the scan rather than failing

#### Scenario: Unsafe environment session id is ignored
- **WHEN** `CLAUDE_SESSION_ID` contains path separators or relative-path components
- **THEN** the shortcut is skipped and lookup falls through to the scan, reading nothing outside the sessions directory

#### Scenario: No session for this directory
- **WHEN** sessions exist but none has a working directory equal to `cwd`
- **THEN** nothing is returned, and transfer reports that no session is known instead of using another project's session

### Requirement: Extraction is bounded by turn count and size
Extraction SHALL keep at most a bounded number of the most recent turns, and
SHALL further drop turns from the oldest end while the retained text exceeds a
size budget, always retaining at least one turn. Bounds exist so a long session
cannot produce an unbounded prompt.

The size budget SHALL be measured in real encoded bytes, not in JavaScript
string length, so that text outside the Latin range is bounded by the same
limit as ASCII rather than exceeding it by its encoded width.

#### Scenario: Oldest turns are dropped first
- **WHEN** the retained turns exceed the size budget
- **THEN** turns are discarded from the oldest end until the budget is met, and the most recent turn is always kept

#### Scenario: Multi-byte text is bounded by the same budget
- **WHEN** the transcript consists of characters that encode to multiple bytes each
- **THEN** the retained text measured in encoded bytes does not exceed the budget

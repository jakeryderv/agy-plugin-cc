# Tasks: fix-conversation-id-extraction

## 1. Regression test (written first, expected to fail)

- [x] 1.1 In `tests/jobs.test.mjs`, add a `REAL_AGY_LOG` fixture holding the
      verbatim excerpt captured during the smoke pass — the `conversationID=""`
      decoy line, the following line starting with the glog prefix `I0725`, the
      `Created conversation <uuid>` line, and the `conversation=<uuid>`
      print-mode line
- [x] 1.2 Assert `extractConversationId(REAL_AGY_LOG)` returns the UUID and,
      explicitly, that it does not return `'I0725'`
- [x] 1.3 Assert `null` for: empty string, a log with no conversation UUID, and
      a log whose only pairing is `conversationID=""`
- [x] 1.4 Assert last-match-wins when two conversation UUIDs appear
- [x] 1.5 Run `node --test tests/jobs.test.mjs` and confirm the new assertions
      fail against current code (returns `'I0725'`)

## 2. Implementation

- [x] 2.1 Rewrite `extractConversationId()` in
      `plugins/agy/scripts/lib/jobs.mjs` to scan line by line, keeping the last
      canonical 8-4-4-4-12 hex UUID found on a line that mentions
      `conversation` (case-insensitive); return `null` when none is found
- [x] 2.2 Note in a comment that the pattern is anchored to agy's real log
      format and that the fixture in `tests/jobs.test.mjs` is the reference
- [x] 2.3 Fix `tests/fake-agy` to emit a real-shaped log (glog lines, empty
      `conversationID=""` startup line, UUID on a later `conversation` line)
      instead of the invented `conversation_id=conv-fake-1234`, and update the
      three assertions in `tests/jobs.test.mjs`,
      `tests/companion-jobs.test.mjs`, and `tests/companion-transfer.test.mjs`
      that expected the invented id

## 3. Plugin surface

- [x] 3.1 In `plugins/agy/commands/resume.md`, replace the "starts with `conv`"
      heuristic with the UUID shape test
- [x] 3.2 In `plugins/agy/commands/transfer.md`, add the null-`conversationId`
      branch

## 4. Verify

- [x] 4.1 Run the full suite (`node --test tests/*.test.mjs`) and confirm all
      tests pass
- [x] 4.2 Re-run `job-result` against the smoke-pass job dir with the real log
      still on disk and confirm the true UUID is returned
- [x] 4.3 End-to-end: `/agy:resume`-equivalent `run --conversation <recovered
      id>` against real agy and confirm the thread actually resumes
- [x] 4.4 Remove entry (h) from `docs/known-issues.md`

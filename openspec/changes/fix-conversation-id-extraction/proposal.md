# Proposal: fix-conversation-id-extraction

## Why

A real-CLI smoke pass against agy 1.1.7 (the first time the plugin ran against
the real binary — the suite only ever exercised `tests/fake-agy`) found that
`extractConversationId()` never recovers a real conversation id. It returned
the string `"I0725"` — a glog timestamp prefix — from both `job-result` and
`transfer`.

Real agy logs record the id as a UUID:

```
I0725 10:47:17.727463 100946 server.go:997] Created conversation 64bb96ef-8a49-4c85-9d5b-c321f9ee6512
I0725 10:47:17.728205 100946 printmode.go:232] Print mode: conversation=64bb96ef-8a49-4c85-9d5b-c321f9ee6512
```

The current regex requires the literal token `conversation` followed by `id`.
In real logs that pairing occurs exactly once — `conversationID=""` on the
print-mode startup line, where the value is empty. The pattern's
`[^a-z0-9-]*` then skips `="")` and the newline and captures the first word of
the *next* log line, `I0725`. Every line that carries the actual UUID says
`conversation <uuid>` with no `id` token, so none of them match.

Consequence: `/agy:resume` cannot resume (it is handed a non-existent id),
and `/agy:result` and `/agy:transfer` report a garbage `conversationId` to the
user. This was filed as speculative minor (h) in `docs/known-issues.md`
("heuristic is fuzzy"); it is in fact a total failure of the feature.

## What Changes

- `extractConversationId()` recovers the UUID that real agy logs emit, scoped
  per line so it can never pair the word `conversation` on one line with a
  token on another.
- Non-UUID candidates are no longer returned. If no conversation UUID is
  present the function returns `null`, so callers report "no id found" instead
  of handing the user a wrong id.
- Regression test built from a verbatim excerpt of a real agy log (captured
  during the smoke pass), so the fake-agy suite is anchored to the real format.
- `/agy:resume`'s id-detection rule is corrected. `resume.md` currently says a
  conversation id is a first token that "starts with `conv`"; real ids are
  UUIDs and never do, so a user pasting a real id has it swallowed into the
  follow-up text and the run silently falls through to `--continue` — a
  different conversation than the one asked for. The rule becomes a UUID shape
  test.
- `/agy:transfer`'s output instruction gains a null-id branch, since a `null`
  id is now reachable where garbage was previously guaranteed.
- Ledger entry (h) removed from `docs/known-issues.md`.

## Capabilities

### New Capabilities

- `conversation-id`: Recovery of the agy conversation id from CLI log output,
  used by `/agy:resume`, `/agy:result`, and `/agy:transfer`.

### Modified Capabilities

(none — `job-cleanup` is unaffected)

## Impact

- `plugins/agy/scripts/lib/jobs.mjs` (`extractConversationId`)
- `tests/jobs.test.mjs` (regression test with a real-log fixture)
- `tests/fake-agy` (emit a real-shaped log instead of the invented
  `conversation_id=conv-fake-1234`; the stub's fictional format is what let the
  bug pass 47 tests) plus the three assertions that expected the invented id
  (`tests/jobs.test.mjs`, `tests/companion-jobs.test.mjs`,
  `tests/companion-transfer.test.mjs`)
- `plugins/agy/commands/resume.md` (id-detection rule)
- `plugins/agy/commands/transfer.md` (null-id branch)
- `docs/known-issues.md` (drop entry (h))
- `/agy:result` needs no change — `result.md` already guards on
  `conversationId` being non-null.

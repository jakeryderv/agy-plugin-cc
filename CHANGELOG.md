# Changelog

## 0.1.1 — 2026-07-25

Fixed: `/agy:resume` did not work. `extractConversationId()` returned a log
timestamp instead of the conversation id on every real run, so `/agy:result`
and `/agy:transfer` reported an unusable id and resuming by it failed. It now
matches the canonical UUID agy actually writes, and returns nothing rather
than a wrong id if the format is unrecognized. `/agy:resume` also no longer
expects ids to start with `conv` — real ids are UUIDs, and a pasted id was
being swallowed into the follow-up text and silently continuing a different
conversation.

Found by the first real-CLI run of the plugin; `tests/fake-agy` had been
emitting an invented log format, and now mirrors the real one. Added
`docs/smoke-test.md`, the pre-release checklist against the real binary.

## 0.1.0 — 2026-07-22

Initial release: /agy:setup, review, adversarial-review, delegate (foreground +
--background jobs), status, result, cancel, resume, transfer, models. Sandboxed
by default; zero-dependency Node companion; file-based job registry.

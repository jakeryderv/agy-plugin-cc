# Changelog

## 0.1.2 — 2026-07-25

Fixed: `--model` and `--effort` were documented as combinable, but agy accepts
no pairing of them — tiered models carry the tier in the name
(`gemini-3.6-flash-low`), and the untiered ones reject `--effort` outright.
Passing both now fails locally with an explanation instead of spending a live
call to be told. Use `--model` with the tier variant you want, or `--effort`
alone for the default model.

Hardened: the sandbox default is now enforced in the single function that
builds agy's arguments, rather than relying on every caller to request it — no
input other than an explicit `--full-access` can produce an unsandboxed run.
A job that exited successfully can no longer be reported `failed` while its
exit status is still being written.

Internal: the plugin's behaviour is now specified in `openspec/specs/` across
six capabilities; the pre-OpenSpec design doc is retired.

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

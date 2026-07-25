# Changelog

## 0.1.4 — 2026-07-25

Fixed: a diff too large to pass to agy failed with `spawnSync … E2BIG` and
nothing else. Review now reports the diff's size, a per-file breakdown, and a
narrower command that fits. agy accepts a prompt only as a command-line
argument, so an oversized diff genuinely cannot be sent — review explains that
rather than reviewing part of it.

Added: `/agy:review -- <paths>` scopes the diff to those paths. Reviewer focus
without `--` is unchanged.

Fixed: running review outside a git repository reported "no changes to review",
telling anyone in the wrong directory that their work was already reviewed.

Fixed: an unknown model with an empty diff spent a live `agy models` call
before noticing there was nothing to review. Local checks now run first — that
case resolves in 28ms rather than 1.3s.

## 0.1.3 — 2026-07-25

Fixed: cancelling a job that had just finished marked it `cancelled`
permanently, hiding its output — `/agy:cancel` now reports the job's real
outcome when it completed under its own power, and only marks jobs it actually
stopped.

Fixed: the SessionStart hook used the session id as a filename without
checking it, so a malformed id could write outside the plugin's state
directory. Ids that aren't already safe filenames are now refused, on both the
write and read paths.

Fixed: `/agy:transfer`'s size budget counted JavaScript string length rather
than encoded bytes, so transcripts in non-Latin scripts were up to 3× larger
than intended.

All three were found by auditing the known-issues ledger against the running
code, rather than by the test suite.

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

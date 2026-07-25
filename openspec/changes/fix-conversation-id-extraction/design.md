# Design: fix-conversation-id-extraction

## Context

`extractConversationId(text)` in `plugins/agy/scripts/lib/jobs.mjs:121-126`
scrapes an agy conversation id out of a log file written via agy's
`--log-file`. Three callers depend on it: `jobResult()` (surfaced by
`/agy:result`), `cmdTransfer()` (surfaced by `/agy:transfer`), and indirectly
`/agy:resume`, which takes an id a user copied from one of those two.

The current pattern is:

```js
/conversation[_ -]?id[^a-z0-9-]*([a-z0-9][a-z0-9-]{3,})/gi
```

It was written against no sample of a real agy log — the test suite runs
against `tests/fake-agy`, which never emitted one. The v0.1.0 smoke pass
(agy 1.1.7) captured the real format for the first time:

```
I0725 10:47:15.230593 100946 printmode.go:108] Print mode: starting (promptLength=50, model="gemini-3.6-flash-low", conversationID="")
I0725 10:47:17.727463 100946 server.go:997] Created conversation 64bb96ef-8a49-4c85-9d5b-c321f9ee6512
I0725 10:47:17.727898 100946 conversation_manager.go:420] project: switching to conversation belonging to project ID: default-cli-project
I0725 10:47:17.728205 100946 printmode.go:232] Print mode: conversation=64bb96ef-8a49-4c85-9d5b-c321f9ee6512, sending message
```

Two facts break the pattern:

1. **The id is a UUID**, and every line that carries it writes
   `conversation <uuid>` or `conversation=<uuid>` — the literal token `id`
   never follows `conversation` on those lines, so none of them match.
2. **The only `conversation`+`id` pairing in the file is `conversationID=""`**,
   with an empty value. `[^a-z0-9-]*` is greedy over non-alphanumerics and
   spans the newline (`="")` + `\n`), so the capture group lands on the first
   word of the *following* log line: the glog timestamp prefix `I0725`.

Because the function returns the *last* match, the result is deterministic
garbage rather than an intermittent one: `"I0725"`, on every run. Observed
identically from `job-result` and `transfer` during the smoke pass.

The plugin surface carries a matching error. `resume.md:9` instructs the model
to treat a first token as an id if it "starts with `conv`" — a guess made from
the same missing knowledge. Real ids start with a hex nibble. A user pasting
`64bb96ef-8a49-4c85-9d5b-c321f9ee6512` fails that test, so the id is treated as
prose, appended to the follow-up, and the command falls through to
`--continue` — resuming the most recent conversation instead of the requested
one, with no error.

## Goals / Non-Goals

**Goals:**
- Recover the real conversation id from real agy log output.
- Never return a non-id. `null` (honest "not found") beats a wrong id, which
  sends `--conversation` off to a nonexistent thread.
- Anchor the test suite to a verbatim real-log fixture so this class of drift
  is caught without invoking real agy.
- Correct the `/agy:resume` id-detection rule to match the real id shape.

**Non-Goals:**
- Having agy report the id through a supported interface. Scraping the log is
  the only channel agy 1.1.7 offers in print mode; if a structured output
  arrives in a later agy version, that is a separate change.
- Changing `--log-file` plumbing or the job-state model.
- The other entries in `docs/known-issues.md`, including the confirmed
  review-ordering (d) and non-git-repo message (e) minors.

## Decisions

1. **Match a UUID, line-scoped, on lines mentioning `conversation`.** Scan the
   log line by line; on each line containing `conversation` (case-insensitive),
   look for a canonical 8-4-4-4-12 hex UUID; keep the last one found.

   Line scoping is the crux of the fix: it makes the cross-line capture that
   produced `"I0725"` structurally impossible, rather than merely unlikely.
   Tightening the existing single-regex approach with a non-greedy or
   newline-excluding separator was considered and rejected — it preserves a
   pattern whose failure mode is "silently pairs a keyword with an unrelated
   token", and the fix would rest on separator subtleties that the next log
   format tweak can defeat. Requiring the value to *look like an id* is the
   property that actually matters.

2. **Require the canonical UUID shape; return `null` otherwise.** This is a
   deliberate tightening. If agy ever changes its id format, the function
   returns `null` and the user is told no id was found, instead of being handed
   a token that fails downstream inside agy with a confusing error. A wrong id
   is worse than no id: `/agy:result` suppresses its resume hint when the id is
   null, so the degraded mode is already handled and quiet.

3. **Keep "last match wins".** Preserves the existing contract, and it is the
   right one: a log may mention an earlier conversation before the one this run
   created (e.g. a `--continue` run that switches threads), and the most
   recently referenced conversation is the resumable one.

4. **Test against a verbatim real-log excerpt, not a synthetic one.** The
   fixture is the four lines above, copied from
   `~/.agy-plugin/jobs/job-1784994434957-5463/agy.log`, including the
   `conversationID=""` decoy line that caused the bug and the trailing `I0725`
   line it captured from. A synthetic fixture would have encoded the same
   wrong assumption the original code did — that is precisely how this bug
   survived 47 passing tests. Tests still never invoke real agy.

5. **State the `/agy:resume` rule as a UUID shape test.** `resume.md` becomes:
   treat the first token as a conversation id when it matches the 8-4-4-4-12
   hex UUID shape. This is checkable by the model without guessing, and it
   fails safe — a non-UUID first token is prose, which is the common case
   (`/agy:resume now add tests`).

## Risks

- **agy could emit ids in a non-UUID format on some platform or version.** Then
  extraction returns `null` and resume-by-id is unavailable until the pattern
  is widened — a visible, honest failure rather than the current silent wrong
  answer. The fixture makes the assumption explicit and greppable.
- **A log line mentioning `conversation` could carry an unrelated UUID** (e.g.
  a project or request id on the same line). Observed real lines put the
  project id in a non-UUID form (`default-cli-project`), and the last-match
  rule prefers the streaming/print-mode lines that carry the true id. Accepted.

# Design: fix-cancel-race-and-session-input

## Context

All three defects were reproduced during the ledger audit; probes are recorded
in the audit commit message and the entries they replace.

`cancelJob()` currently ends with an unconditional write:

```js
if (pidAlive(meta.pid)) { process.kill(-meta.pid, 'SIGKILL'); }
meta.cancelled = true;                 // <- regardless of what happened
writeFileSync(metaPath(id), ...);
return { id, state: 'cancelled' };
```

The job can finish on its own between `jobState()` reading `running` and the
signal landing. Then the wrapper writes `exit-code` **and** we write
`cancelled: true`. Since derivation checks `cancelled` first, the job reads
`cancelled` forever, with a valid exit code and real output sitting unused
beside it.

## Goals / Non-Goals

**Goals:**
- A job that completed under its own power is never reported cancelled.
- The hook cannot write outside `<stateDir>/sessions/`.
- The extraction budget bounds real bytes.

**Non-Goals:**
- The ARG_MAX ceiling. Moving the review prompt off argv is a genuine design
  decision (stdin vs temp file) and gets its own change.
- Entries (c), (d), (e), (f), parseArgs, and the prune-trigger scope — all
  verified as described and none able to produce a wrong answer.

## Decisions

1. **A recorded exit status outranks the intent to cancel.** After the grace
   wait, re-read the status file; if it holds a complete integer, return the
   derived terminal state and never write `cancelled`.

   This rests on a fact I verified rather than assumed: when the process group
   is SIGTERMed, the wrapper (`agy … ; echo $? > exit-code`) dies *before*
   reaching the `echo`, so **nothing is written**. A recorded status therefore
   cannot have come from our own signal — it is unambiguous evidence the job
   finished on its own. That rules out the alternative I had considered, of
   trusting only an exit code of `0` on the theory that a signal-terminated
   wrapper might record `143`. It doesn't record anything, so the simpler rule
   is also the correct one.

   Note this changes `cancelJob`'s return, not the derivation rule.
   "Cancellation outranks a recorded exit status" in `job-registry` stays
   exactly as written — it is the right rule for a job that genuinely *was*
   cancelled. The bug was marking one that wasn't.

2. **Reject unsafe session ids rather than sanitising them.** Sanitising (say,
   replacing separators with `_`) means the hook writes one name while a lookup
   keyed on the raw `CLAUDE_SESSION_ID` looks for another, and two distinct ids
   could collapse onto one file. Rejecting keeps writer and reader in exact
   agreement: an id that is not already a safe filename simply has no session
   file. Claude Code emits UUIDs, so this never fires in practice; when it does,
   the cost is that `/agy:transfer` reports no known session — which is the
   honest outcome and already a supported path.

   The check lives in `lib/transcript.mjs` beside `latestSession()` and is used
   by both the hook and the lookup, so the two cannot drift.

3. **Validate on read as well as on write.** `latestSession()` builds a path
   from `CLAUDE_SESSION_ID` directly. Even with the hook guarded, a hostile
   value in that variable would otherwise let a read escape the directory. The
   same predicate guards both.

4. **`Buffer.byteLength(text, 'utf8')` for the budget.** What the field was
   always named for. `Buffer` is a Node global, so no import churn.

## Risks

- **A job that failed on its own microseconds before cancellation now reports
  `failed` rather than `cancelled`.** That is the intended consequence of
  Decision 1 and is more truthful: the job's own exit status is a fact, whereas
  our cancellation didn't determine the outcome. Callers already handle every
  terminal state.
- **Rejecting an unsafe id silently disables transfer for that session.** The
  hook must never break session startup, so it cannot report the problem
  loudly; it stays silent by design, exactly as it does for malformed payloads
  today. Accepted, and the failure mode — transfer says no session is known —
  is already a documented path with actionable guidance.

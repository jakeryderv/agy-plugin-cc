# Design: review-preflight-reports-actionable-reasons

## Context

`cmdReview()` currently does, in order: validate flags (including a live
`agy models` call), run `git diff HEAD`, fall back to `git diff`, bail if the
result is empty, build the prompt, spawn.

Two consequences. The empty check cannot distinguish "clean tree" from "git
failed", because `spawnSync('git', …).stdout` is `''` in both cases and the
exit status is discarded. And the one step that costs a network round trip runs
before the local ones that might have made it unnecessary.

The size ceiling was measured rather than assumed:

```
largest single argv element accepted: 131071 bytes   (binary-searched via execve)
MAX_ARG_STRLEN (32 × 4096 pagesize) : 131072
prompt scaffolding                  :     384 bytes
usable diff                         : 130687 bytes  (127.6 KiB)
```

## Goals / Non-Goals

**Goals:**
- Each precondition failure names its actual cause.
- An oversized diff produces something the user can act on.
- The network-dependent check runs last.

**Non-Goals:**
- Truncating the diff to fit. A review that examined the first 128 KiB and
  found nothing reads as "clean" to a tired user; that is a worse outcome than
  a clear refusal, and byte-truncation also cuts mid-hunk, degrading the input.
- Chunking the diff across several calls. Real feature, different change: it
  multiplies quota, needs cross-chunk dedupe, and each chunk still sees an
  arbitrary subset — likely worse findings than the coherent subset a user
  picks deliberately.
- Weakening the sandbox. `--dangerously-skip-permissions` would unblock the
  `@file` path, and `sandbox-safety` forbids it for reviews unconditionally.

## Decisions

1. **Detect `E2BIG`; do not predict it.** The per-argument cap is a Linux
   constant (`MAX_ARG_STRLEN`, 32 pages). macOS has no per-argument cap and
   constrains total argv instead, so a hardcoded 131071-byte threshold would
   refuse diffs macOS handles — and I cannot test macOS here, so predicting
   means guessing. `execve` rejects before the binary starts, so catching
   `r.error.code === 'E2BIG'` costs nothing, works on every platform at that
   platform's real limit, and needs no constant to maintain.

   This replaces an earlier plan to pre-flight the diff size against a
   threshold. Detection is strictly better: it can neither over-refuse nor
   under-refuse.

2. **Report a per-file breakdown and a fitting command; classify nothing.**
   Sizes come from `git diff --numstat`-style per-path measurement, ordered
   largest first, with a suggested `--` scope computed by accumulating files
   under the budget from the smallest up.

   Deliberately *not* labelling files as generated, vendored, or noise. That is
   a heuristic which is wrong sometimes, and being wrong here means quietly
   steering a reviewer away from a file that mattered. Size ordering is a fact;
   the user judges from it in seconds.

3. **Distinguish "not a work tree" by asking git, not by inspecting output.**
   `git rev-parse --is-inside-work-tree` answers directly, instead of inferring
   from an empty diff. That is what makes #3's two cases separable at all.

4. **Move only the network check.** `validateModelEffortCombo` and
   `validateEffort` are local and free, so they stay early — a malformed
   command should still fail immediately. Only `validateModel`, which shells
   out to `agy models`, moves after the diff checks. This addresses #4 without
   making a well-formed-but-wrong command slower to reject.

5. **Exit 1 for every precondition failure.** Matches today's empty-diff
   behaviour. These are not usage errors — the flags parsed fine — so 64 would
   contradict the exit-code contract in `companion-contract`.

## Risks

- **`E2BIG` could in principle arise from something other than the prompt** —
  e.g. a pathological environment size. The message would then blame the diff.
  Accepted: the prompt is the only argument review controls that can approach
  the limit, and the breakdown shown makes the real size visible either way.
- **The suggested command is a suggestion.** It fits files under the budget by
  size alone, so it may propose a scope the user considers uninteresting. It is
  printed as an option, not applied.

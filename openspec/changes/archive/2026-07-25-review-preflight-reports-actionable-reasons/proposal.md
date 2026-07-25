# Proposal: review-preflight-reports-actionable-reasons

## Why

Closes #1, #3, and #4. They read as three unrelated bugs but are one function
misbehaving: `cmdReview()` reports a single vague message for several distinct
conditions, and does its only expensive check before its cheap ones.

**#1 — a large diff fails with an unactionable error.** Review passes the whole
diff as one argv element. Linux caps a single argument at 131071 bytes
(`MAX_ARG_STRLEN`, 32 pages — measured, not assumed), leaving 130687 bytes of
usable diff after the prompt scaffolding. Past that, `execve` refuses and the
user's entire output is:

```
spawnSync /home/jake/.local/bin/agy E2BIG
```

The message names the binary, which misdirects — agy was never started. Nothing
mentions the diff, its size, or any limit. Note `getconf ARG_MAX` reports
4194304 on the same box, so the obvious diagnostic actively misleads: the
per-argument cap is a separate, much smaller limit it does not report.

Probes established there is no way to route around this: agy 1.1.7 ignores a
prompt on stdin entirely (answering something unrelated, exit 0), and `@file`
makes the model resolve the reference with a tool that the mandatory sandbox
auto-denies. argv is the only channel, so the ceiling is real and review must
explain it rather than transport around it.

**#3 — outside a git repo, review claims the tree is clean.** Both git
invocations fail, and the user is told "no changes to review (git diff HEAD and
git diff are both empty)". Someone in the wrong directory is told their work is
already reviewed.

**#4 — the expensive check runs first.** An unknown model plus an empty diff
spends a live `agy models` call (~1.3s) before reporting the empty diff.

## What Changes

- Review distinguishes its failure conditions and reports each honestly: not in
  a git work tree, nothing to review, and a diff too large to pass to agy.
- The oversized case is **detected, not predicted**. Rather than comparing the
  diff against a hardcoded threshold, review attempts the spawn and handles
  `E2BIG`. The per-argument limit is a Linux constant that macOS does not share
  — macOS constrains total argv instead — so a hardcoded threshold would refuse
  diffs that platform handles. `execve` fails instantly, before agy starts, so
  detection costs nothing.
- On `E2BIG`, review reports the diff size, a per-file breakdown ordered by
  size, and a narrower command computed by fitting files under the budget.
  Files are **not** classified as generated or noise: that is a heuristic, and
  being wrong means steering someone away from a file that mattered. Sorting by
  size and showing what fits leaves the judgement with the user.
- Model validation moves after the local checks. The free checks (the
  `--model`/`--effort` conflict, effort values) stay early; only the one that
  costs a live call moves.

## Capabilities

### Modified Capabilities

- `companion-contract`: review's preconditions are distinguishable, and the
  only network-dependent validation runs last.

## Impact

- `plugins/agy/scripts/agy-companion.mjs` (`cmdReview`, `streamAgy`)
- `tests/companion-core.test.mjs`
- Exit code stays 1 for every precondition failure, matching today's empty-diff
  behaviour — the user's command was well-formed, so 64 would be wrong.
- No change to a review that fits: same prompt, same flags, same output.

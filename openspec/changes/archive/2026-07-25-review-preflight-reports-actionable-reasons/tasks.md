# Tasks: review-preflight-reports-actionable-reasons

## 1. Regression tests (written first, expected to fail)

- [x] 1.1 In `tests/companion-core.test.mjs`, assert review outside a git work
      tree exits 1 with a message naming that cause, and not the "no changes"
      wording
- [x] 1.2 Assert review in a clean work tree still exits 1 saying there is
      nothing to review
- [x] 1.3 Assert an oversized diff exits 1 with a message carrying the total
      size, a per-file breakdown, and a suggested narrower command — and not a
      bare `spawnSync … E2BIG`
- [x] 1.4 Assert the oversized case runs no review at all (the stub is never
      invoked, so no partial result can be produced)
- [x] 1.5 Assert an unknown model with an empty diff reports the empty diff
      without invoking agy to list models
- [x] 1.6 Assert a malformed flag combination still exits 64 before any diff
      work
- [x] 1.7 Run the file and confirm the new assertions fail

## 2. Implementation

- [x] 2.1 Add a work-tree check via `git rev-parse --is-inside-work-tree`, and
      report that case separately from an empty diff
- [x] 2.2 Reorder `cmdReview` so local checks precede `validateModel`, keeping
      the free flag validation early
- [x] 2.3 Have the review spawn surface `E2BIG` distinctly rather than printing
      the raw error, so the caller can explain it
- [x] 2.4 Build the oversized-diff report: total size, per-file sizes ordered
      largest first, and a suggested `--` scope accumulated from the smallest
      files upward while they fit
- [x] 2.5 Confirm a fitting review is byte-for-byte unchanged in the arguments
      it passes

## 3. Verify

- [x] 3.1 Full suite green, repeated to confirm no flakiness
- [x] 3.2 Against real agy: a normal review still works, and a >128 KiB diff
      now explains itself instead of printing `spawnSync … E2BIG`
- [x] 3.3 Close #1, #3, #4 via `Fixes` trailers in the commit — the first
      exercise of the issue-to-change loop recorded in `openspec/config.yaml`

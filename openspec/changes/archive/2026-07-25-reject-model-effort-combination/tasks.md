# Tasks: reject-model-effort-combination

## 1. Regression tests (written first, expected to fail)

- [x] 1.1 In `tests/agy.test.mjs`, assert the new validation throws a usage
      error when both a model and an effort are supplied, and does not throw
      for either alone or neither
- [x] 1.2 In `tests/companion-core.test.mjs`, assert a task subcommand given
      both flags exits 64 with a message naming both flags, and that the fake
      agy was never invoked
- [x] 1.3 Run both files and confirm the new assertions fail against current
      code

## 2. Implementation

- [x] 2.1 Add the combination check to `lib/agy.mjs`, beside `validateModel`
      and `validateEffort`, raising a usage error phrased around what to do
      instead of reproducing agy's wording
- [x] 2.2 Call it from `taskFlags()` in `agy-companion.mjs` so every task
      subcommand is covered at one point

## 3. Documentation

- [x] 3.1 `README.md` — present the flags as alternatives, and note that tiered
      models carry the tier in the name
- [x] 3.2 `plugins/agy/commands/models.md` — same correction
- [x] 3.3 The six `argument-hint` lines that offer both flags
      (`delegate`, `review`, `adversarial-review`, `transfer`)
- [x] 3.4 `plugins/agy/agents/agy-runner.md` — flag forwarding guidance
- [x] 3.5 `docs/smoke-test.md` — add a step covering the combination, since
      only a real-CLI run surfaces it

## 4. Verify

- [x] 4.1 Full suite green
- [x] 4.2 Confirm against real agy that `--effort` alone still works and that
      the combination now fails locally at exit 64 without a live call

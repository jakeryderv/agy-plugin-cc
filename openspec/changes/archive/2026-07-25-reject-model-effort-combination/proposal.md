# Proposal: reject-model-effort-combination

## Why

`--model` and `--effort` cannot be used together with agy 1.1.7 — for any
model it offers. The plugin documents them as freely combinable, so a user
following the README gets an agy error and a wasted live call.

Testing the flag against the real CLI (it had never been exercised; the suite
only ever checked that the plugin *emits* it) produced two distinct failures
covering the whole model list:

```
$ agy --model gemini-3.6-flash-low --effort high
Error: --model gemini-3.6-flash-low conflicts with --effort=high

$ agy --model claude-sonnet-4-6 --effort high
Error: --effort is not supported for model "claude-sonnet-4-6"
```

Nine of the eleven models encode the tier in the name
(`gemini-3.6-flash-low`, `gemini-3.1-pro-high`, `gpt-oss-120b-medium`, …), so
passing `--effort` alongside is a contradiction. The remaining two
(`claude-sonnet-4-6`, `claude-opus-4-6-thinking`) do not support the flag at
all. `--effort` works only when `--model` is omitted, where it selects the tier
for the default model.

The README states "Every task command accepts `--model <name>` … and
`--effort low|medium|high`", `models.md` repeats it, and six commands advertise
both in their `argument-hint`. All of it describes an invocation that always
fails.

## What Changes

- The companion rejects the combination before invoking agy, as a usage error
  (exit 64) explaining that agy encodes the effort tier in the model name and
  that the two flags are alternatives. This matches how unknown model names are
  already handled: catch it locally rather than spend a live call to be told.
- README, `models.md`, `agy-runner.md`, and the six `argument-hint` lines are
  corrected to present the flags as alternatives.
- `docs/smoke-test.md` gains a step covering the flag combination, since this
  was found only by running the real CLI.

## Capabilities

### Modified Capabilities

- `companion-contract`: model and effort validation covers their
  compatibility, not just each value independently.

### New Capabilities

(none)

## Impact

- `plugins/agy/scripts/lib/agy.mjs` (new validation)
- `plugins/agy/scripts/agy-companion.mjs` (`taskFlags`, the single point every
  task subcommand passes through)
- `tests/agy.test.mjs`, `tests/companion-core.test.mjs`
- `README.md`, `plugins/agy/commands/*.md`, `plugins/agy/agents/agy-runner.md`
- `docs/smoke-test.md`
- Behaviour change for users: an invocation that previously reached agy and
  failed there now fails locally with a clearer message. No previously-working
  invocation stops working.

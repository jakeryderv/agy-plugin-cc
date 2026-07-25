# Design: reject-model-effort-combination

## Context

`taskFlags()` in `agy-companion.mjs` is the single point every task subcommand
(`run`, `review`, `job-start`, `transfer`) passes its flags through. It calls
`validateModel()` against the live listing and `validateEffort()` against
`low|medium|high`. Each value is checked in isolation; their compatibility is
not, because nothing in the plugin ever knew they were incompatible — the flag
had never been sent to a real agy.

Verified behaviour of agy 1.1.7, across both classes of model in its listing:

| `--model` | `--effort` | Result |
|---|---|---|
| omitted | `high` | works |
| `gemini-3.6-flash-low` (tier in name) | `high` | `conflicts with --effort=high` |
| `claude-sonnet-4-6` (no tier) | `high` | `--effort is not supported for model` |

Nine of eleven listed models carry a tier suffix; the other two reject the flag.
There is currently no model for which both flags can be supplied.

## Goals / Non-Goals

**Goals:**
- A combination that cannot succeed fails locally, with an explanation, before
  a live call is spent.
- The documentation stops describing an impossible invocation.
- The smoke checklist covers flag *combinations*, not just individual flags.

**Non-Goals:**
- Inferring an effort tier from `--effort` and rewriting it into a model name
  (e.g. `--effort high` + `gemini-3.6-flash-low` → `gemini-3.6-flash-high`).
  That guesses at the user's intent and hardcodes agy's naming scheme into the
  plugin; the naming pattern is agy's to change.
- Changing what `--effort` alone does.

## Decisions

1. **Reject locally rather than let agy report it.** The plugin already
   pre-validates model names against the live listing rather than letting agy
   error, and the same reasoning applies more strongly here: the failure is
   deterministic across every model, and catching it locally saves a live call
   and produces a message that explains *why* rather than restating the
   conflict.

   This sits in tension with an existing decision recorded in
   `companion-contract`: when `agy models` cannot be reached, validation
   deliberately *accepts* the model and lets agy report the problem, so an
   availability outage cannot block a run. The distinction is what the check
   depends on. That one depends on a network call that can fail; this one
   depends only on the two flags the user typed, so it cannot produce a false
   negative from an outage.

2. **A blanket rule, not a per-model one.** The plugin does not try to work out
   which models carry a tier suffix. Parsing model names for `-low|-medium|-high`
   would encode agy's naming convention in the plugin and would still be wrong
   for the two models that reject the flag outright. Since no model currently
   accepts both, a blanket rule is both simpler and more accurate.

3. **Validate in `lib/agy.mjs`, call from `taskFlags()`.** Keeps it beside
   `validateModel` and `validateEffort`, unit-testable without spawning the
   companion, and applied once for every task subcommand rather than repeated
   at four call sites.

## Risks

- **agy may later support the combination.** Then the guard rejects a valid
  invocation and the user has no override. This is the real cost of Decision 1.
  It is a single conditional with an explicit error message, so it is trivial
  to remove; `docs/smoke-test.md` gains a step that would catch the change on
  the next release check. Accepted because the alternative — documenting and
  permitting a combination that fails 100% of the time today — is worse for
  every current user.
- **The message could mislead if agy's reasoning changes.** It is therefore
  phrased around what the user should do (use one or the other) rather than
  reproducing agy's internal explanation.

# Proposal: retire-superpowers-docs

## Why

The repo was built under the superpowers plugin and later moved to OpenSpec.
`openspec/specs/` is declared the source of truth, but it holds only
`job-cleanup` and `conversation-id`. Every other contract the plugin actually
honours — the companion's exit codes, the job registry layout and state
derivation, sandbox-by-default, the transfer/hook design — lives solely in
`docs/superpowers/specs/2026-07-22-agy-plugin-design.md`, a frozen pre-OpenSpec
document. The repo therefore contradicts its own rule that loose design docs
are never current decisions.

That document is also measurably stale. Checking it against the code found
eleven divergences (listed in `design.md`), including a module that was never
built, a flag never passed, and a prune rule that contradicts the `job-cleanup`
spec. A document that looks authoritative and is wrong in eleven places is
worse than one that is absent.

Deleting it outright would destroy the contracts it still records correctly.
So the contracts move into specs first, verified against the code rather than
transcribed, and the document is deleted in the same change — atomically, so
there is never a window in which neither the doc nor a spec is authoritative.

## What Changes

- Four capabilities are added to `openspec/specs/`, each requirement checked
  against the implementation as it was written:
  - `companion-contract` — entrypoint and subcommand surface, JSON-vs-passthrough
    output, the exit-code table, flag parsing, binary discovery, model/effort
    validation.
  - `job-registry` — on-disk layout, job identity, detached spawn, lazy state
    derivation and its precedence, cancellation semantics. Complements the
    existing `job-cleanup` spec, which governs pruning only.
  - `sandbox-safety` — sandbox-by-default for every headless run,
    `--full-access` never implied, credentials never touched.
  - `session-transfer` — the SessionStart hook, session lookup, transcript turn
    extraction and its budgets, handoff prompt.
- `docs/superpowers/` is deleted (the implementation plan was already removed
  in a prior commit as executed history).
- `openspec/config.yaml` context is updated: the pointer to
  `docs/superpowers/` and the dead `.superpowers/sdd/progress.md` are removed,
  and the project constraints worth keeping that are *not* testable behaviour
  (exit-code table, state-dir env var, never-hardcode-model-names, the v0.1
  out-of-scope decisions) move there rather than into specs.
- Divergences found between the doc and the code are recorded in `design.md`
  and resolved in favour of the code, since the code is what ships. Two that
  represent genuine gaps rather than doc errors are added to
  `docs/known-issues.md` rather than silently dropped.

## Capabilities

### New Capabilities

- `companion-contract`: The `agy-companion.mjs` entrypoint's subcommand
  surface, output modes, exit codes, argument parsing, and agy discovery.
- `job-registry`: On-disk representation and lifecycle of background jobs —
  layout, identity, spawn, state derivation, cancellation.
- `sandbox-safety`: The invariants governing how the plugin invokes agy and
  what it is permitted to touch.
- `session-transfer`: Recording Claude session transcripts and handing session
  context to an agy conversation.

### Modified Capabilities

(none — `job-cleanup` and `conversation-id` are unchanged; `job-registry` is
scoped to exclude pruning, which `job-cleanup` already owns)

## Impact

- `openspec/specs/{companion-contract,job-registry,sandbox-safety,session-transfer}/`
  (new, via archive sync)
- `openspec/config.yaml` (context rewritten)
- `docs/superpowers/` (deleted)
- `docs/known-issues.md` (two gaps recorded)
- **No code or test changes.** This change documents behaviour that already
  ships; if any requirement here required a code change to be true, that would
  be a separate change.

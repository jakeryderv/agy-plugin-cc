# Tasks: retire-superpowers-docs

## 1. Audit

- [x] 1.1 Read `agy-companion.mjs`, `lib/agy.mjs`, `lib/args.mjs`,
      `lib/jobs.mjs`, `lib/transcript.mjs`, and `session-hook.mjs`, and compare
      each claim in `docs/superpowers/specs/2026-07-22-agy-plugin-design.md`
      against the implementation
- [x] 1.2 Record every divergence in `design.md` with what the document claims
      and what the code does

## 2. Capability specs (each requirement verified against the code, not transcribed)

- [x] 2.1 `companion-contract` — subcommand surface, exit-code table, structured
      vs streamed output, argument parsing, model/effort validation, binary
      discovery, setup readiness
- [x] 2.2 `job-registry` — state root and layout, job identity, detached spawn,
      derived state and its precedence, cancellation, unknown-id handling, and
      an explicit deferral of pruning to `job-cleanup`
- [x] 2.3 `sandbox-safety` — sandbox-by-default, full-access never implied and
      never escalated to on failure, review always sandboxed, credentials never
      handled, only the local binary invoked, prompts carry only intended content
- [x] 2.4 `session-transfer` — SessionStart hook and its never-block guarantee,
      session lookup precedence and project isolation, turn extraction and
      budgets, handoff prompt, transfer preconditions

## 3. Findings from the audit

- [x] 3.1 Record the two document/code divergences that are real gaps rather
      than documentation errors (prune trigger scope; no automated end-to-end
      coverage of the subcommand surface) in `docs/known-issues.md`
- [x] 3.2 Record the latent hazard found while verifying `sandbox-safety`:
      `buildAgyArgs()` emits neither the sandbox nor the skip-permissions flag
      if a caller passes neither. All four current call sites pass
      `sandbox: true`, so the invariant holds today, but the safety-critical
      default is not enforced by the function itself

## 4. Retire the documents

- [x] 4.1 Delete `docs/superpowers/` (the implementation plan was already
      removed as executed history in a prior commit)
- [x] 4.2 Rewrite `openspec/config.yaml` context: drop the pointers to
      `docs/superpowers/` and `.superpowers/sdd/progress.md`, and fold in the
      non-behavioural constraints worth keeping — exit-code table, state-dir
      variable, never-hardcode-model-names, and the v0.1 out-of-scope decisions
- [x] 4.3 Leave the archived `2026-07-23-prune-corrupt-job-dirs` change
      untouched, including its `.superpowers` references — archived changes are
      history

## 5. Verify

- [x] 5.1 `openspec validate --changes --strict` passes
- [x] 5.2 Full suite green — no code changed, so this is a regression check
      that the documentation change touched nothing it should not have
- [x] 5.3 Confirm no `superpowers` references remain outside the archive
- [x] 5.4 After archiving, `openspec validate --specs --strict` passes and
      `openspec list --specs` shows six capabilities

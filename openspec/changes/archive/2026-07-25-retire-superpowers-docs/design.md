# Design: retire-superpowers-docs

## Context

`docs/superpowers/specs/2026-07-22-agy-plugin-design.md` (183 lines, marked
"Status: Approved", dated 2026-07-22) is the architectural spec the v0.1.0
build was executed from, under the superpowers workflow. The repo has since
adopted OpenSpec, and `openspec/config.yaml` describes the document as
"frozen, historical" while still pointing at it.

In practice it is not historical: it is the only written record of most of the
plugin's behavioural contracts. `openspec/specs/` covers pruning
(`job-cleanup`) and conversation-id recovery (`conversation-id`) and nothing
else.

## Goals / Non-Goals

**Goals:**
- Contracts that are still true move into `openspec/specs/`, verified against
  the code.
- `docs/superpowers/` is gone, with no window where authority is ambiguous.
- Divergences between the document and the code are surfaced, not silently
  resolved.

**Non-Goals:**
- Changing any behaviour. This change is documentation-only; no code or test
  edits. Where a divergence reveals a real defect, it is recorded in
  `docs/known-issues.md` as a candidate change, not fixed here.
- Specifying everything the document contained. The repo-layout tree, the
  command table, and the publishing steps are dropped as history (see
  Decision 3).
- Rewriting the archived `2026-07-23-prune-corrupt-job-dirs` change, which
  references `.superpowers/sdd/progress.md`. Archived changes are history and
  must read as they did when archived.

## Decisions

1. **One change, not four.** The four capabilities could be backfilled
   separately, but the deletion of the source document must land with the
   migration. Splitting would leave `docs/superpowers/` in the tree across
   several changes, which is exactly the ambiguous-authority state this change
   exists to end. The cost is a larger change; the tasks are ordered per
   capability so review can proceed one at a time.

2. **Verify each requirement against the code; the code wins.** Requirements
   were written by reading `agy-companion.mjs`, `lib/*.mjs`, and
   `session-hook.mjs`, not by transcribing the document. Where the two
   disagree, the spec records what the code does — the code is what ships. The
   divergence table below is the audit trail.

3. **Constraints that are not testable behaviour go to `config.yaml`, not
   specs.** Node >= 18.18, zero dependencies, the exact test command, the
   commit style, the plugin identity, and the v0.1 out-of-scope decisions (no
   daemon, no Stop-hook review gate, macOS/Linux/WSL only) are project context,
   not requirements with scenarios. Forcing them into spec form would produce
   unfalsifiable requirements. The exit-code *table* is the exception: it is a
   real interface contract, so it is both a requirement in
   `companion-contract` and a note in context.

4. **`job-registry` excludes pruning.** `job-cleanup` already owns the 7-day
   expiry and corrupt-meta removal. `job-registry` covers layout, identity,
   spawn, state derivation, and cancellation, and defers to `job-cleanup` for
   deletion. Keeping one prune contract in one capability avoids the two specs
   drifting apart.

## Divergences found (document vs. code)

Checking the document against the implementation found eleven. All are
resolved in favour of the code.

| # | Document claims | Code does |
|---|---|---|
| 1 | `lib/render.mjs` — "JSON output helpers" | Never existed. `lib/` is `agy`, `args`, `jobs`, `transcript`; output goes through a local `emit()` in the companion. |
| 2 | agy invoked with `--mode` among its flags | `buildAgyArgs()` never passes `--mode`. |
| 3 | "Jobs older than 7 days are pruned opportunistically on any `job-*` call" | Only `listJobs()` prunes — i.e. bare `job-status` with no id. Contradicts the `job-cleanup` spec, which is correct. |
| 4 | Tests run via `node --test tests/` | Breaks on Node >= 21; the real command is `node --test tests/*.test.mjs`. |
| 5 | "Smoke script exercising companion subcommands end-to-end with the stub" | Never built. Real-CLI smoke testing is now `docs/smoke-test.md`, a manual checklist. |
| 6 | `meta.json` holds "state, pid, timestamps, exit code" | `meta.json` holds neither state nor exit code. State is derived on read; the exit code lives in a separate `exit-code` file. Storing state would have made it a second source of truth. |
| 7 | State derivation: exit-code → pid alive | Correct as far as it goes, but omits that `meta.cancelled` is checked **first** and outranks both. |
| 8 | `job-start`: "validate flags, write meta, spawn detached" | Spawns first, then writes `meta.json`. The window this opens is exactly what `job-cleanup`'s grace period exists to cover. |
| 9 | Transfer extracts "the last N turns (bounded byte budget)" | `maxTurns = 30`, `maxBytes = 16000`, and the budget counts JS string length (UTF-16 code units), not bytes — already tracked in `docs/known-issues.md`. |
| 10 | Setup reports "auth status" | Reports auth status *reconciled with reality*: if `agy models` works but no credential location was found, status is reported as `keyring` rather than `missing`. An undocumented behaviour worth specifying. |
| 11 | `sessions/<id>.json` holds "transcript path, cwd" | Also holds `sessionId` and `updatedAt`; `updatedAt` is load-bearing — `latestSession()` sorts on it. |

Two of these are gaps rather than documentation errors, and are added to
`docs/known-issues.md` rather than dropped:

- **#3** — the document's "any `job-*` call" is arguably the better design; the
  existing ledger entry "pruning only runs in listJobs" already covers it, and
  is now cross-referenced to this finding.
- **#5** — there is no automated end-to-end test over the companion's
  subcommand surface, only unit tests plus a manual real-CLI checklist. Worth
  recording as a coverage gap.

## Risks

- **Specs written from code inherit the code's bugs.** A requirement that
  documents buggy behaviour makes the bug harder to see. Mitigated by scoping
  requirements to contracts the smoke pass or the test suite actually
  exercised, and by pointing at `docs/known-issues.md` where behaviour is known
  to be imperfect (e.g. the exit-code read race is *not* written into
  `job-registry` as desired behaviour).
- **Four capabilities in one change is a lot of surface to review.** Accepted
  for the atomicity argument in Decision 1; tasks are ordered per capability.

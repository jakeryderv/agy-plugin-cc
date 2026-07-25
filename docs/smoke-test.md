# Real-CLI smoke test

Run this before cutting a release.

## Why this exists

The automated suite runs entirely against `tests/fake-agy` and never invokes
the real binary. That is the right default — tests must be hermetic and free —
but it means **the suite cannot detect the stub drifting from reality**.

That is not hypothetical. v0.1.0 shipped with `extractConversationId()`
returning a log timestamp instead of a conversation id on every real run,
which made `/agy:resume` non-functional. It passed all 47 tests because
`fake-agy` emitted an invented log format that matched the code's wrong
assumption. Code and stub agreed with each other and disagreed with agy.

This checklist is the only thing that catches that class of bug. Where a step
depends on the *shape* of agy's real output, it says so — those are the steps
that matter most.

## Prerequisites

- Real `agy` installed and authenticated (`agy --version`, `agy models`)
- Run from the repo root
- Steps marked **[quota]** make real model calls

Set a scratch state dir first if you don't want the run mixed into your real
job history:

```bash
export AGY_PLUGIN_STATE_DIR=$(mktemp -d)
```

Note the real agy version you tested against, and update this doc if its
output format changed.

## Steps

### 1. Setup and auth

```bash
node plugins/agy/scripts/agy-companion.mjs setup
```

Expect `"ready": true`, a real path and version, `"working": true`, and a
non-zero model count.

### 2. Model listing

```bash
node plugins/agy/scripts/agy-companion.mjs models
```

Expect the live model list. **Compare it against `agy models` directly** — the
companion must not reformat or truncate it.

### 3. Model validation against the live list

```bash
node plugins/agy/scripts/agy-companion.mjs job-start --model definitely-not-a-model "x"
```

Expect exit 64 and the friendly "unknown model" list. Confirms validation is
reading the real model names, not a cached or invented set.

### 4. Background job lifecycle **[quota]**

```bash
node plugins/agy/scripts/agy-companion.mjs job-start --model <fast-model> \
  "Reply with exactly the word PONG and nothing else."
node plugins/agy/scripts/agy-companion.mjs job-status <job-id>   # repeat until not running
node plugins/agy/scripts/agy-companion.mjs job-result <job-id>
```

Expect `running` → `done`, `exitCode: 0`, and `output` containing the reply.

**Format-dependent:** `conversationId` must be a canonical UUID
(`8-4-4-4-12` hex). A value that is not a UUID — especially one that looks like
a log fragment such as `I0725` — means agy's log format moved and
`extractConversationId()` needs updating. This is the exact check that v0.1.0
lacked.

### 5. Resume by recovered id **[quota]**

```bash
node plugins/agy/scripts/agy-companion.mjs run --conversation <id-from-step-4> \
  --model <fast-model> "What single word did you reply with a moment ago?"
```

Expect agy to recall its own prior turn. This is the end-to-end proof that the
id is real and resumable — step 4 alone only proves it is UUID-shaped.

### 6. Cancel **[quota]**

Start a long job, cancel it a few seconds in:

```bash
node plugins/agy/scripts/agy-companion.mjs job-start --model <slow-model> "<long task>"
node plugins/agy/scripts/agy-companion.mjs job-cancel <job-id>
node plugins/agy/scripts/agy-companion.mjs job-status <job-id>
ps -eo pid,args | grep -c "[/]path/to/agy"
```

Expect state `cancelled`, no `exit-code` file in the job dir, and **zero**
surviving agy processes — the whole process group must be reaped, not just
bash. Beware writing the process check so its own pattern matches the shell
running it; grep for the agy binary path, not the task text.

### 7. Review **[quota]**

In a throwaway git repo with a small diff containing a deliberate bug:

```bash
node plugins/agy/scripts/agy-companion.mjs review --model <fast-model> "off-by-one risks"
```

Expect findings that actually reference the planted bug with file/line —
confirms the diff really reached agy and the sandbox didn't block the read.

### 8. Transfer **[quota]**

```bash
node plugins/agy/scripts/agy-companion.mjs transfer --model <fast-model>
```

Expect a non-zero `turns` count, an acknowledgement showing agy understood the
session context, and — **format-dependent** — a UUID `conversationId`, subject
to the same check as step 4.

### 9. Flag combinations **[quota]**

Individual flags being accepted does not mean they compose. `--effort` shipped
on every invocation for a full release before anyone sent it to a real agy.

```bash
node plugins/agy/scripts/agy-companion.mjs run --effort low "Reply with exactly: OK"
node plugins/agy/scripts/agy-companion.mjs run --model <name> --effort high "x"
```

Expect the first to succeed. Expect the second to be **rejected locally with
exit 64** — agy accepts no `--model`/`--effort` pairing, so the plugin catches
it before spending a call.

**If agy ever starts accepting the combination**, that local rejection becomes
wrong and `validateModelEffortCombo()` should be removed. Checking here is how
that gets noticed.

### 10. Edge paths (no quota)

```bash
cd "$(mktemp -d)" && node <repo>/plugins/agy/scripts/agy-companion.mjs review
```

Expect a non-zero exit and an error message. Known limitation: outside a git
repo this reports "no changes to review" even though git failed — see
`docs/known-issues.md` (e).

## Cleanup

Remove the scratch state dir, and any throwaway repos. If you used the real
state dir, the job dirs prune themselves after 7 days.

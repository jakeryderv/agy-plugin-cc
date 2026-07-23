# agy-plugin-cc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code plugin (`/agy:*`) integrating the Google Antigravity CLI — reviews, delegation with background jobs, thread continuity — mirroring the UX of openai/codex-plugin-cc without its app-server broker.

**Architecture:** Markdown slash commands invoke a single zero-dependency Node ESM companion script (`agy-companion.mjs`) that wraps the local `agy` binary. Background jobs are detached `agy -p` processes tracked in a file-based registry under `~/.agy-plugin/`. One SessionStart hook records transcript paths so `/agy:transfer` can hand a Claude session to an agy conversation.

**Tech Stack:** Node.js >= 18.18 (ESM, `node:test`), bash (detached job wrapper), agy CLI >= 1.0.x, Claude Code plugin format (marketplace + plugin manifests, command/agent markdown, hooks.json).

## Global Constraints

- Zero npm dependencies; Node built-ins only. No `package.json` needed — but tests run via `node --test tests/`.
- Node >= 18.18 (codex plugin parity); CI tests Node 18 and 24.
- Never hardcode model names in logic; validate against live `agy models` output. (Docs may show examples.)
- Headless safety: every headless agy run gets `--sandbox` unless `--full-access` (maps to `--dangerously-skip-permissions`) was explicitly passed.
- State root: `process.env.AGY_PLUGIN_STATE_DIR || ~/.agy-plugin` — all tests MUST set `AGY_PLUGIN_STATE_DIR` to a temp dir.
- Tests MUST set `AGY_BIN` to the fake-agy stub; never invoke real `agy` in tests.
- The plugin never reads or writes agy credentials.
- Exit codes: 0 ok, 1 runtime failure, 64 usage error, 127 agy not installed.
- Commit messages: conventional-commit style (`feat:`, `test:`, `docs:`, `chore:`), no attribution trailers of any kind.
- Plugin name `agy`, marketplace name `agy-plugin-cc`, version 0.1.0, MIT license, author jakeryderv.
- All file paths below are relative to the repo root `~/dev/projects/agy-plugin-cc`.

---

### Task 1: Repo scaffold and manifests

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/agy/.claude-plugin/plugin.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `README.md` (stub; full docs in Task 11)

**Interfaces:**
- Consumes: nothing
- Produces: manifest identity (`agy@agy-plugin-cc`) used by install instructions; directory layout all later tasks write into

- [ ] **Step 1: Write marketplace manifest**

`.claude-plugin/marketplace.json`:

```json
{
  "name": "agy-plugin-cc",
  "owner": {
    "name": "jakeryderv",
    "url": "https://github.com/jakeryderv"
  },
  "plugins": [
    {
      "name": "agy",
      "source": "./plugins/agy",
      "description": "Use the Google Antigravity CLI (agy) from Claude Code — delegate tasks, run cross-model reviews, manage background jobs, resume conversations."
    }
  ]
}
```

- [ ] **Step 2: Write plugin manifest**

`plugins/agy/.claude-plugin/plugin.json`:

```json
{
  "name": "agy",
  "version": "0.1.0",
  "description": "Use the Google Antigravity CLI (agy) from Claude Code — /agy:setup, /agy:review, /agy:adversarial-review, /agy:delegate (with background jobs), /agy:status, /agy:result, /agy:cancel, /agy:resume, /agy:transfer, /agy:models.",
  "author": {
    "name": "jakeryderv",
    "url": "https://github.com/jakeryderv"
  }
}
```

- [ ] **Step 3: Write .gitignore and LICENSE**

`.gitignore`:

```
node_modules/
*.log
.DS_Store
```

`LICENSE`: standard MIT license text, year 2026, holder `jakeryderv`.

```
MIT License

Copyright (c) 2026 jakeryderv

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md` stub:

```markdown
# agy-plugin-cc

Use the Google Antigravity CLI (`agy`) from inside Claude Code.

Work in progress — see `docs/superpowers/specs/` for the design.
```

- [ ] **Step 4: Verify both manifests parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json')); JSON.parse(require('fs').readFileSync('plugins/agy/.claude-plugin/plugin.json')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold plugin manifests, license, gitignore"
```

---

### Task 2: Flag parser (`lib/args.mjs`)

**Files:**
- Create: `plugins/agy/scripts/lib/args.mjs`
- Test: `tests/args.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `class UsageError extends Error`; `parseArgs(argv: string[], spec: Record<string,'flag'|'value'>) -> { flags: Record<string, string|true>, positional: string[] }`. Throws `UsageError` on unknown flag, missing value, or value given to a boolean flag. `--` ends flag parsing. Used by every companion subcommand.

- [ ] **Step 1: Write the failing test**

`tests/args.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, UsageError } from '../plugins/agy/scripts/lib/args.mjs';

const SPEC = { model: 'value', effort: 'value', background: 'flag', 'full-access': 'flag' };

test('parses value flags, boolean flags, and positionals', () => {
  const r = parseArgs(['--model', 'pro', '--background', 'do', 'the', 'thing'], SPEC);
  assert.deepEqual(r.flags, { model: 'pro', background: true });
  assert.deepEqual(r.positional, ['do', 'the', 'thing']);
});

test('parses --flag=value form', () => {
  const r = parseArgs(['--effort=high', 'task'], SPEC);
  assert.equal(r.flags.effort, 'high');
});

test('double dash ends flag parsing', () => {
  const r = parseArgs(['--model', 'pro', '--', '--not-a-flag'], SPEC);
  assert.deepEqual(r.positional, ['--not-a-flag']);
});

test('unknown flag throws UsageError', () => {
  assert.throws(() => parseArgs(['--bogus'], SPEC), UsageError);
});

test('missing value throws UsageError', () => {
  assert.throws(() => parseArgs(['--model'], SPEC), UsageError);
  assert.throws(() => parseArgs(['--model='], SPEC), UsageError);
});

test('value passed to boolean flag throws UsageError', () => {
  assert.throws(() => parseArgs(['--background=yes'], SPEC), UsageError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/args.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (args.mjs does not exist)

- [ ] **Step 3: Implement**

`plugins/agy/scripts/lib/args.mjs`:

```js
export class UsageError extends Error {}

export function parseArgs(argv, spec) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const kind = spec[name];
      if (!kind) throw new UsageError(`unknown flag --${name}`);
      if (kind === 'flag') {
        if (eq !== -1) throw new UsageError(`--${name} takes no value`);
        flags[name] = true;
        i += 1;
      } else {
        let value;
        if (eq !== -1) {
          value = arg.slice(eq + 1);
          i += 1;
        } else {
          value = argv[i + 1];
          i += 2;
        }
        if (value === undefined || value === '') {
          throw new UsageError(`--${name} requires a value`);
        }
        flags[name] = value;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { flags, positional };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/args.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/lib/args.mjs tests/args.test.mjs
git commit -m "feat: flag parser with UsageError"
```

---

### Task 3: agy adapter (`lib/agy.mjs`) and fake-agy test stub

**Files:**
- Create: `plugins/agy/scripts/lib/agy.mjs`
- Create: `tests/fake-agy` (executable Node script)
- Test: `tests/agy.test.mjs`

**Interfaces:**
- Consumes: `UsageError` from `./args.mjs`
- Produces (all exported from `lib/agy.mjs`):
  - `findAgy() -> string|null` — `AGY_BIN` env override first, then PATH scan, then fallbacks `~/.local/bin/agy`, `/usr/local/bin/agy`, `/opt/antigravity/bin/agy`
  - `authStatus() -> 'api-key'|'oauth'|'missing'`
  - `agyVersion(bin) -> string|null`
  - `listModels(bin) -> string[]|null`
  - `validateModel(bin, model) -> void` (throws UsageError listing live models)
  - `validateEffort(effort) -> void` (throws UsageError unless low|medium|high)
  - `buildAgyArgs(opts) -> string[]` where opts = `{ prompt, model?, effort?, fullAccess?, sandbox?, continueLast?, conversation?, logFile?, printTimeout? }` (printTimeout default `'10m'`)
- `tests/fake-agy` behavior (used by every later test task): `--version` prints `agy version 9.9.9-fake`; `models` prints three models `fake-flash`, `fake-pro`, `fake-opus` one per line; `-p <prompt>` prints `fake-agy: <prompt> [model=<model or default>] [mode=<full-access|sandbox|normal>]`, honors `FAKE_AGY_SLEEP_MS` (sleep before responding) and exits 3 if prompt contains `FAIL`; when `--log-file <f>` given, appends line `INFO conversation_id=conv-fake-1234` to that file.

- [ ] **Step 1: Write the fake-agy stub**

`tests/fake-agy` (then `chmod +x tests/fake-agy`):

```js
#!/usr/bin/env node
// Minimal stand-in for the real agy CLI, used by the test suite only.
import { appendFileSync } from 'node:fs';

const argv = process.argv.slice(2);

if (argv[0] === '--version') {
  console.log('agy version 9.9.9-fake');
  process.exit(0);
}
if (argv[0] === 'models') {
  console.log('fake-flash\nfake-pro\nfake-opus');
  process.exit(0);
}

let prompt = '';
let model = 'default';
let mode = 'normal';
let logFile = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-p' || a === '--print') prompt = argv[++i] ?? '';
  else if (a === '--model') model = argv[++i];
  else if (a === '--log-file') logFile = argv[++i];
  else if (a === '--sandbox') mode = 'sandbox';
  else if (a === '--dangerously-skip-permissions') mode = 'full-access';
  else if (a === '--effort' || a === '--conversation' || a === '--print-timeout') i++;
  // --continue and unknown flags: ignore
}

const sleepMs = Number(process.env.FAKE_AGY_SLEEP_MS || 0);
setTimeout(() => {
  if (logFile) appendFileSync(logFile, 'INFO conversation_id=conv-fake-1234\n');
  console.log(`fake-agy: ${prompt} [model=${model}] [mode=${mode}]`);
  process.exit(prompt.includes('FAIL') ? 3 : 0);
}, sleepMs);
```

Run: `chmod +x tests/fake-agy`

- [ ] **Step 2: Write the failing test**

`tests/agy.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  findAgy, agyVersion, listModels, validateModel, validateEffort, buildAgyArgs,
} from '../plugins/agy/scripts/lib/agy.mjs';
import { UsageError } from '../plugins/agy/scripts/lib/args.mjs';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fake-agy');
process.env.AGY_BIN = FAKE;

test('findAgy honors AGY_BIN override', () => {
  assert.equal(findAgy(), FAKE);
});

test('agyVersion returns first line', () => {
  assert.equal(agyVersion(FAKE), 'agy version 9.9.9-fake');
});

test('listModels parses live output', () => {
  assert.deepEqual(listModels(FAKE), ['fake-flash', 'fake-pro', 'fake-opus']);
});

test('validateModel accepts a listed model and rejects others', () => {
  validateModel(FAKE, 'fake-pro');
  assert.throws(() => validateModel(FAKE, 'gpt-99'), UsageError);
  assert.throws(() => validateModel(FAKE, 'gpt-99'), /fake-flash/);
});

test('validateEffort accepts low|medium|high only', () => {
  validateEffort('low');
  validateEffort('high');
  assert.throws(() => validateEffort('max'), UsageError);
});

test('buildAgyArgs: sandbox default vs full access', () => {
  const s = buildAgyArgs({ prompt: 'hi', sandbox: true });
  assert.ok(s.includes('--sandbox'));
  const f = buildAgyArgs({ prompt: 'hi', sandbox: true, fullAccess: true });
  assert.ok(f.includes('--dangerously-skip-permissions'));
  assert.ok(!f.includes('--sandbox'));
});

test('buildAgyArgs: passthrough flags and default timeout', () => {
  const a = buildAgyArgs({
    prompt: 'hi', model: 'fake-pro', effort: 'high',
    conversation: 'conv-1', logFile: '/tmp/x.log',
  });
  assert.deepEqual(a.slice(0, 2), ['-p', 'hi']);
  assert.ok(a.includes('--model') && a.includes('fake-pro'));
  assert.ok(a.includes('--effort') && a.includes('high'));
  assert.ok(a.includes('--conversation') && a.includes('conv-1'));
  assert.ok(a.includes('--log-file') && a.includes('/tmp/x.log'));
  assert.ok(a.includes('--print-timeout') && a.includes('10m'));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/agy.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (agy.mjs does not exist)

- [ ] **Step 4: Implement**

`plugins/agy/scripts/lib/agy.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { UsageError } from './args.mjs';

const FALLBACKS = () => [
  join(homedir(), '.local', 'bin', 'agy'),
  '/usr/local/bin/agy',
  '/opt/antigravity/bin/agy',
];

export function findAgy() {
  if (process.env.AGY_BIN) {
    return existsSync(process.env.AGY_BIN) ? process.env.AGY_BIN : null;
  }
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, 'agy');
    if (existsSync(p)) return p;
  }
  for (const p of FALLBACKS()) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function authStatus() {
  if (process.env.ANTIGRAVITY_API_KEY) return 'api-key';
  if (
    existsSync(join(homedir(), '.config', 'antigravity')) ||
    existsSync(join(homedir(), '.gemini', 'antigravity-cli'))
  ) return 'oauth';
  return 'missing';
}

export function agyVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim().split('\n')[0];
}

export function listModels(bin) {
  const r = spawnSync(bin, ['models'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function validateModel(bin, model) {
  const models = listModels(bin);
  if (models && !models.includes(model)) {
    throw new UsageError(
      `unknown model "${model}". Available models:\n  ${models.join('\n  ')}`,
    );
  }
}

export function validateEffort(effort) {
  if (!['low', 'medium', 'high'].includes(effort)) {
    throw new UsageError(`--effort must be low, medium, or high (got "${effort}")`);
  }
}

export function buildAgyArgs(opts) {
  const args = ['-p', opts.prompt];
  if (opts.model) args.push('--model', opts.model);
  if (opts.effort) args.push('--effort', opts.effort);
  if (opts.fullAccess) args.push('--dangerously-skip-permissions');
  else if (opts.sandbox) args.push('--sandbox');
  if (opts.continueLast) args.push('--continue');
  if (opts.conversation) args.push('--conversation', opts.conversation);
  if (opts.logFile) args.push('--log-file', opts.logFile);
  args.push('--print-timeout', opts.printTimeout || '10m');
  return args;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/agy.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add plugins/agy/scripts/lib/agy.mjs tests/fake-agy tests/agy.test.mjs
git commit -m "feat: agy adapter (discovery, auth, models, arg building) + fake-agy stub"
```

---

### Task 4: Job registry (`lib/jobs.mjs`)

**Files:**
- Create: `plugins/agy/scripts/lib/jobs.mjs`
- Test: `tests/jobs.test.mjs`

**Interfaces:**
- Consumes: `buildAgyArgs` from `./agy.mjs`; `UsageError` from `./args.mjs`
- Produces (exported from `lib/jobs.mjs`):
  - `stateDir() -> string` (`AGY_PLUGIN_STATE_DIR` || `~/.agy-plugin`)
  - `startJob(bin, task, opts) -> meta` — opts `{ model?, effort?, fullAccess?, cwd? }`; meta `{ id, task, model, effort, fullAccess, pid, cwd, createdAt, cancelled }`; spawns detached bash wrapper writing `output.log`, `agy.log`, and `exit-code` in the job dir
  - `jobState(meta) -> 'running'|'done'|'failed'|'cancelled'`
  - `getJob(id) -> meta` (throws UsageError if unknown)
  - `listJobs() -> Array<meta & { state }>` newest first; prunes job dirs older than 7 days
  - `jobResult(id) -> { id, state, exitCode: number|null, output: string, conversationId: string|null }`
  - `cancelJob(id) -> Promise<{ id, state }>` — async; SIGTERM to process group, SIGKILL after 5s grace, persists `cancelled: true`
  - `extractConversationId(text) -> string|null` — last match of `/conversation[_ -]?id[^a-z0-9-]*([a-z0-9][a-z0-9-]{3,})/gi`

- [ ] **Step 1: Write the failing test**

`tests/jobs.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fake-agy');
process.env.AGY_BIN = FAKE;
process.env.AGY_PLUGIN_STATE_DIR = mkdtempSync(join(tmpdir(), 'agy-jobs-'));

const {
  startJob, getJob, jobState, listJobs, jobResult, cancelJob, extractConversationId, stateDir,
} = await import('../plugins/agy/scripts/lib/jobs.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDone(id, timeoutMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = jobState(getJob(id));
    if (s !== 'running') return s;
    await sleep(50);
  }
  throw new Error('job did not finish in time');
}

test('startJob runs to done and result includes output + conversation id', async () => {
  const meta = startJob(FAKE, 'say hello', {});
  assert.match(meta.id, /^job-/);
  const state = await waitDone(meta.id);
  assert.equal(state, 'done');
  const r = jobResult(meta.id);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /fake-agy: say hello/);
  assert.match(r.output, /mode=sandbox/); // sandbox by default
  assert.equal(r.conversationId, 'conv-fake-1234');
});

test('full-access opts out of sandbox', async () => {
  const meta = startJob(FAKE, 'careful now', { fullAccess: true });
  await waitDone(meta.id);
  assert.match(jobResult(meta.id).output, /mode=full-access/);
});

test('failing task ends failed with exit code', async () => {
  const meta = startJob(FAKE, 'please FAIL', {});
  const state = await waitDone(meta.id);
  assert.equal(state, 'failed');
  assert.equal(jobResult(meta.id).exitCode, 3);
});

test('cancelJob kills a running job', async () => {
  process.env.FAKE_AGY_SLEEP_MS = '10000';
  const meta = startJob(FAKE, 'long task', {});
  delete process.env.FAKE_AGY_SLEEP_MS;
  await sleep(200);
  assert.equal(jobState(getJob(meta.id)), 'running');
  const r = await cancelJob(meta.id);
  assert.equal(r.state, 'cancelled');
  assert.equal(jobState(getJob(meta.id)), 'cancelled');
});

test('listJobs returns newest first and prunes ancient jobs', async () => {
  const old = startJob(FAKE, 'ancient', {});
  await waitDone(old.id);
  const dir = join(stateDir(), 'jobs', old.id);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  meta.createdAt = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  const fresh = startJob(FAKE, 'fresh', {});
  await waitDone(fresh.id);
  const jobs = listJobs();
  assert.ok(jobs.length >= 1);
  assert.equal(jobs[0].id, fresh.id);
  assert.ok(!jobs.some((j) => j.id === old.id));
  assert.ok(!existsSync(dir));
});

test('getJob unknown id throws', async () => {
  const { UsageError } = await import('../plugins/agy/scripts/lib/args.mjs');
  assert.throws(() => getJob('job-nope'), UsageError);
});

test('extractConversationId finds last id, tolerates absence', () => {
  assert.equal(extractConversationId('x conversation_id=abc-1 y\nconversation_id=def-2'), 'def-2');
  assert.equal(extractConversationId('nothing here'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/jobs.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (jobs.mjs does not exist)

- [ ] **Step 3: Implement**

`plugins/agy/scripts/lib/jobs.mjs`:

```js
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { buildAgyArgs } from './agy.mjs';
import { UsageError } from './args.mjs';

export function stateDir() {
  return process.env.AGY_PLUGIN_STATE_DIR || join(homedir(), '.agy-plugin');
}

const jobsRoot = () => join(stateDir(), 'jobs');
const jobDir = (id) => join(jobsRoot(), id);
const metaPath = (id) => join(jobDir(id), 'meta.json');

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function startJob(bin, task, opts = {}) {
  const id = `job-${Date.now()}-${randomBytes(2).toString('hex')}`;
  const dir = jobDir(id);
  mkdirSync(dir, { recursive: true });
  const agyArgs = buildAgyArgs({
    prompt: task,
    model: opts.model,
    effort: opts.effort,
    fullAccess: opts.fullAccess,
    sandbox: true,
    logFile: join(dir, 'agy.log'),
  });
  const script = [
    `exec > ${shq(join(dir, 'output.log'))} 2>&1`,
    `${shq(bin)} ${agyArgs.map(shq).join(' ')}`,
    `echo $? > ${shq(join(dir, 'exit-code'))}`,
  ].join('\n');
  const child = spawn('bash', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    cwd: opts.cwd || process.cwd(),
  });
  const meta = {
    id,
    task,
    model: opts.model || null,
    effort: opts.effort || null,
    fullAccess: Boolean(opts.fullAccess),
    pid: child.pid,
    cwd: opts.cwd || process.cwd(),
    createdAt: new Date().toISOString(),
    cancelled: false,
  };
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
  child.unref();
  return meta;
}

export function getJob(id) {
  if (!existsSync(metaPath(id))) {
    const known = existsSync(jobsRoot()) ? readdirSync(jobsRoot()).join(', ') : '(none)';
    throw new UsageError(`unknown job "${id}". Known jobs: ${known}`);
  }
  return JSON.parse(readFileSync(metaPath(id), 'utf8'));
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function jobState(meta) {
  if (meta.cancelled) return 'cancelled';
  const exitFile = join(jobDir(meta.id), 'exit-code');
  if (existsSync(exitFile)) {
    const code = parseInt(readFileSync(exitFile, 'utf8').trim(), 10);
    return code === 0 ? 'done' : 'failed';
  }
  return pidAlive(meta.pid) ? 'running' : 'failed';
}

export function listJobs() {
  if (!existsSync(jobsRoot())) return [];
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const out = [];
  for (const id of readdirSync(jobsRoot())) {
    let meta;
    try {
      meta = getJob(id);
    } catch {
      continue;
    }
    if (new Date(meta.createdAt).getTime() < cutoff) {
      rmSync(jobDir(id), { recursive: true, force: true });
      continue;
    }
    out.push({ ...meta, state: jobState(meta) });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

export function extractConversationId(text) {
  const re = /conversation[_ -]?id[^a-z0-9-]*([a-z0-9][a-z0-9-]{3,})/gi;
  let match = null;
  for (const m of text.matchAll(re)) match = m[1];
  return match;
}

export function jobResult(id) {
  const meta = getJob(id);
  const state = jobState(meta);
  const outFile = join(jobDir(id), 'output.log');
  const logFile = join(jobDir(id), 'agy.log');
  const exitFile = join(jobDir(id), 'exit-code');
  return {
    id,
    state,
    exitCode: existsSync(exitFile)
      ? parseInt(readFileSync(exitFile, 'utf8').trim(), 10)
      : null,
    output: existsSync(outFile) ? readFileSync(outFile, 'utf8') : '',
    conversationId: existsSync(logFile)
      ? extractConversationId(readFileSync(logFile, 'utf8'))
      : null,
  };
}

// Async so the event loop keeps running during the grace wait — a blocked
// loop cannot reap the dead child, and kill(pid, 0) reports zombies alive.
export async function cancelJob(id) {
  const meta = getJob(id);
  if (jobState(meta) === 'running') {
    try {
      process.kill(-meta.pid, 'SIGTERM');
    } catch { /* group may be gone */ }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && pidAlive(meta.pid)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (pidAlive(meta.pid)) {
      try {
        process.kill(-meta.pid, 'SIGKILL');
      } catch { /* already dead */ }
    }
  }
  meta.cancelled = true;
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
  return { id, state: 'cancelled' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/jobs.test.mjs`
Expected: PASS (7 tests). Note: the cancel test takes ~1s; failing/hanging here usually means the detached spawn or process-group kill is wrong.

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/lib/jobs.mjs tests/jobs.test.mjs
git commit -m "feat: file-based background job registry with cancel and pruning"
```

---

### Task 5: Transcript handoff (`lib/transcript.mjs`)

**Files:**
- Create: `plugins/agy/scripts/lib/transcript.mjs`
- Test: `tests/transcript.test.mjs`

**Interfaces:**
- Consumes: `stateDir` from `./jobs.mjs`
- Produces:
  - `latestSession(cwd) -> { sessionId, transcriptPath, cwd, updatedAt } | null` — prefers `CLAUDE_SESSION_ID` env match, then newest session file with matching cwd, then newest overall
  - `extractTurns(transcriptPath, { maxTurns = 30, maxBytes = 16000 }) -> Array<{ role: 'user'|'assistant', text }>` — Claude transcript JSONL; keeps text blocks only, drops tool noise and empty turns, keeps the most recent turns within budget
  - `buildHandoffPrompt(turns, cwd) -> string` — handoff preamble + transcript + instruction to acknowledge and wait

- [ ] **Step 1: Write the failing test**

`tests/transcript.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.AGY_PLUGIN_STATE_DIR = mkdtempSync(join(tmpdir(), 'agy-tr-'));
delete process.env.CLAUDE_SESSION_ID;

const { latestSession, extractTurns, buildHandoffPrompt } =
  await import('../plugins/agy/scripts/lib/transcript.mjs');

const sessionsDir = join(process.env.AGY_PLUGIN_STATE_DIR, 'sessions');

function writeSession(id, cwd, updatedAt) {
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(
    join(sessionsDir, `${id}.json`),
    JSON.stringify({ sessionId: id, transcriptPath: `/tmp/${id}.jsonl`, cwd, updatedAt }),
  );
}

test('latestSession: no sessions -> null', () => {
  assert.equal(latestSession('/nowhere'), null);
});

test('latestSession prefers cwd match, else newest', () => {
  writeSession('s-old', '/proj/a', '2026-07-01T00:00:00Z');
  writeSession('s-new', '/proj/b', '2026-07-22T00:00:00Z');
  assert.equal(latestSession('/proj/a').sessionId, 's-old');
  assert.equal(latestSession('/proj/zzz').sessionId, 's-new');
});

test('latestSession prefers CLAUDE_SESSION_ID when set', () => {
  process.env.CLAUDE_SESSION_ID = 's-old';
  assert.equal(latestSession('/proj/b').sessionId, 's-old');
  delete process.env.CLAUDE_SESSION_ID;
});

test('extractTurns keeps text turns, drops tool noise, respects budgets', () => {
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'first question' } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'an answer' }] } }),
    JSON.stringify({ type: 'system', message: { content: 'ignored' } }),
    'not json at all',
    JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'follow-up' }] } }),
  ];
  const p = join(process.env.AGY_PLUGIN_STATE_DIR, 't.jsonl');
  writeFileSync(p, lines.join('\n'));
  const turns = extractTurns(p, {});
  assert.deepEqual(turns.map((t) => t.role), ['user', 'assistant', 'user']);
  assert.equal(turns[1].text, 'an answer');
  assert.deepEqual(extractTurns(p, { maxTurns: 1 }).map((t) => t.text), ['follow-up']);
  const budget = extractTurns(p, { maxBytes: 12 });
  assert.equal(budget[budget.length - 1].text, 'follow-up');
  assert.ok(budget.length < 3);
});

test('buildHandoffPrompt embeds turns and waits for user', () => {
  const prompt = buildHandoffPrompt(
    [{ role: 'user', text: 'q1' }, { role: 'assistant', text: 'a1' }],
    '/proj/a',
  );
  assert.match(prompt, /USER:\nq1/);
  assert.match(prompt, /ASSISTANT:\na1/);
  assert.match(prompt, /\/proj\/a/);
  assert.match(prompt, /do not take any action yet/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/transcript.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` (transcript.mjs does not exist)

- [ ] **Step 3: Implement**

`plugins/agy/scripts/lib/transcript.mjs`:

```js
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './jobs.mjs';

export function latestSession(cwd) {
  const dir = join(stateDir(), 'sessions');
  if (!existsSync(dir)) return null;
  const sid = process.env.CLAUDE_SESSION_ID;
  if (sid && existsSync(join(dir, `${sid}.json`))) {
    return JSON.parse(readFileSync(join(dir, `${sid}.json`), 'utf8'));
  }
  const sessions = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      sessions.push(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    } catch { /* skip corrupt */ }
  }
  if (!sessions.length) return null;
  const pool = sessions.filter((s) => s.cwd === cwd);
  const pick = (pool.length ? pool : sessions)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return pick[0];
}

export function extractTurns(transcriptPath, { maxTurns = 30, maxBytes = 16000 } = {}) {
  const turns = [];
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    const content = entry.message?.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
    text = text.trim();
    if (!text) continue;
    turns.push({ role: entry.type, text });
  }
  let selected = turns.slice(-maxTurns);
  let total = selected.reduce((n, t) => n + t.text.length, 0);
  while (selected.length > 1 && total > maxBytes) {
    total -= selected[0].text.length;
    selected = selected.slice(1);
  }
  return selected;
}

export function buildHandoffPrompt(turns, cwd) {
  const body = turns
    .map((t) => `${t.role.toUpperCase()}:\n${t.text}`)
    .join('\n\n---\n\n');
  return [
    'You are taking over a coding session from another assistant.',
    `Working directory: ${cwd}`,
    'Below is the recent conversation transcript. Read it, briefly acknowledge',
    'the context you now have, and then wait for the user\'s next message.',
    'Do not take any action yet.',
    '',
    '=== TRANSCRIPT ===',
    body,
    '=== END TRANSCRIPT ===',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/transcript.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/lib/transcript.mjs tests/transcript.test.mjs
git commit -m "feat: transcript session lookup and handoff prompt builder"
```

---

### Task 6: SessionStart hook

**Files:**
- Create: `plugins/agy/scripts/session-hook.mjs`
- Create: `plugins/agy/hooks/hooks.json`
- Test: `tests/session-hook.test.mjs`

**Interfaces:**
- Consumes: `stateDir` from `./lib/jobs.mjs`; hook payload JSON on stdin (`{ session_id, transcript_path, cwd }`)
- Produces: `sessions/<session_id>.json` files with `{ sessionId, transcriptPath, cwd, updatedAt }` — the exact shape `latestSession()` (Task 5) reads. Always exits 0.

- [ ] **Step 1: Write the failing test**

`tests/session-hook.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(ROOT, 'plugins/agy/scripts/session-hook.mjs');

function runHook(stdin, stateDirPath) {
  return spawnSync('node', [HOOK], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, AGY_PLUGIN_STATE_DIR: stateDirPath },
  });
}

test('writes session file from hook payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-hook-'));
  const r = runHook(
    JSON.stringify({ session_id: 'sess-1', transcript_path: '/tmp/t.jsonl', cwd: '/proj' }),
    dir,
  );
  assert.equal(r.status, 0);
  const saved = JSON.parse(readFileSync(join(dir, 'sessions', 'sess-1.json'), 'utf8'));
  assert.equal(saved.sessionId, 'sess-1');
  assert.equal(saved.transcriptPath, '/tmp/t.jsonl');
  assert.equal(saved.cwd, '/proj');
  assert.ok(saved.updatedAt);
});

test('garbage stdin exits 0 and writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-hook-'));
  const r = runHook('this is not json', dir);
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, 'sessions')));
});

test('payload without session_id exits 0 silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-hook-'));
  const r = runHook(JSON.stringify({ cwd: '/proj' }), dir);
  assert.equal(r.status, 0);
  assert.ok(!existsSync(join(dir, 'sessions')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/session-hook.test.mjs`
Expected: FAIL — spawnSync exits non-zero / file assertions fail (session-hook.mjs does not exist)

- [ ] **Step 3: Implement hook script and hooks.json**

`plugins/agy/scripts/session-hook.mjs`:

```js
// SessionStart hook: record this session's transcript path for /agy:transfer.
// Must never block or fail session startup — always exit 0.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './lib/jobs.mjs';

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    if (payload.session_id && payload.transcript_path) {
      const dir = join(stateDir(), 'sessions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${payload.session_id}.json`),
        JSON.stringify({
          sessionId: payload.session_id,
          transcriptPath: payload.transcript_path,
          cwd: payload.cwd || process.cwd(),
          updatedAt: new Date().toISOString(),
        }, null, 2),
      );
    }
  } catch { /* never block session start */ }
  process.exit(0);
});
```

`plugins/agy/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/session-hook.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/session-hook.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/session-hook.mjs plugins/agy/hooks/hooks.json tests/session-hook.test.mjs
git commit -m "feat: SessionStart hook recording transcript path"
```

---

### Task 7: Companion entrypoint — setup, models, run, review

**Files:**
- Create: `plugins/agy/scripts/agy-companion.mjs`
- Test: `tests/companion-core.test.mjs`

**Interfaces:**
- Consumes: everything from `lib/args.mjs`, `lib/agy.mjs`, `lib/jobs.mjs` (stateDir only so far)
- Produces: CLI contract `node agy-companion.mjs <subcommand> [flags] [args]`:
  - `setup` → JSON `{ ready, agy: { available, path, version }, auth: { status }, models: { count } | null, error: string | null }`, always exit 0
  - `models` → passthrough of `agy models` (exit 127 if agy missing)
  - `run [--model M] [--effort E] [--full-access] [--continue] [--conversation ID] <prompt>` → streams agy output, propagates agy's exit code; sandbox unless `--full-access`
  - `review [--adversarial] [--model M] [--effort E] [focus...]` → composes review prompt with embedded `git diff HEAD` (fallback `git diff`), always `--sandbox`; exit 1 with message when diff is empty
  - Errors: UsageError → stderr + exit 64; agy missing → stderr + exit 127
- Later tasks (8, 9) add subcommands to this same file's dispatch table.

- [ ] **Step 1: Write the failing test**

`tests/companion-core.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANION = join(ROOT, 'plugins/agy/scripts/agy-companion.mjs');
const FAKE = join(ROOT, 'tests/fake-agy');
const STATE = mkdtempSync(join(tmpdir(), 'agy-comp-'));

function run(args, opts = {}) {
  return spawnSync('node', [COMPANION, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AGY_BIN: FAKE,
      AGY_PLUGIN_STATE_DIR: STATE,
      ...(opts.env || {}),
    },
    cwd: opts.cwd || ROOT,
  });
}

test('setup reports ready with fake agy', () => {
  const r = run(['setup']);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ready, true);
  assert.equal(j.agy.available, true);
  assert.equal(j.agy.version, 'agy version 9.9.9-fake');
  assert.equal(j.models.count, 3);
});

test('setup reports not ready when agy missing', () => {
  const r = run(['setup'], { env: { AGY_BIN: '/nonexistent/agy' } });
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ready, false);
  assert.equal(j.agy.available, false);
  assert.match(j.error, /not installed/i);
});

test('models passthrough', () => {
  const r = run(['models']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /fake-pro/);
});

test('run is sandboxed by default, full-access opts out', () => {
  const s = run(['run', 'hello world']);
  assert.equal(s.status, 0);
  assert.match(s.stdout, /fake-agy: hello world .*mode=sandbox/);
  const f = run(['run', '--full-access', 'hello']);
  assert.match(f.stdout, /mode=full-access/);
});

test('run validates model against live list', () => {
  const bad = run(['run', '--model', 'gpt-99', 'x']);
  assert.equal(bad.status, 64);
  assert.match(bad.stderr, /fake-pro/);
  const good = run(['run', '--model', 'fake-pro', 'x']);
  assert.equal(good.status, 0);
  assert.match(good.stdout, /model=fake-pro/);
});

test('run propagates agy exit code', () => {
  const r = run(['run', 'please FAIL']);
  assert.equal(r.status, 3);
});

test('run without prompt is a usage error', () => {
  const r = run(['run']);
  assert.equal(r.status, 64);
});

test('review embeds the git diff, always sandboxed', () => {
  const repo = mkdtempSync(join(tmpdir(), 'agy-repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  writeFileSync(join(repo, 'a.txt'), 'brand new line\n');
  spawnSync('git', ['add', '.'], { cwd: repo });
  const r = run(['review', 'focus on correctness'], { cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /mode=sandbox/);
  assert.match(r.stdout, /brand new line/);
  assert.match(r.stdout, /focus on correctness/);
});

test('review with no diff fails with guidance', () => {
  const repo = mkdtempSync(join(tmpdir(), 'agy-repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  const r = run(['review'], { cwd: repo });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no changes/i);
});

test('adversarial review uses the challenge prompt', () => {
  const repo = mkdtempSync(join(tmpdir(), 'agy-repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
  writeFileSync(join(repo, 'a.txt'), 'x\n');
  spawnSync('git', ['add', '.'], { cwd: repo });
  const r = run(['review', '--adversarial'], { cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /adversarial/i);
});

test('unknown subcommand exits 64', () => {
  const r = run(['bogus']);
  assert.equal(r.status, 64);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/companion-core.test.mjs`
Expected: FAIL — spawnSync cannot find agy-companion.mjs (all tests error)

- [ ] **Step 3: Implement**

`plugins/agy/scripts/agy-companion.mjs`:

```js
#!/usr/bin/env node
// agy-companion — the single entrypoint every /agy:* command invokes.
// Subcommands added in later tasks extend the dispatch table at the bottom.
import { spawnSync } from 'node:child_process';
import { parseArgs, UsageError } from './lib/args.mjs';
import {
  findAgy, authStatus, agyVersion, listModels, validateModel, validateEffort, buildAgyArgs,
} from './lib/agy.mjs';

const INSTALL_HINT =
  'agy is not installed. Install with: curl -fsSL https://antigravity.google/cli/install.sh | bash';

function requireAgy() {
  const bin = findAgy();
  if (!bin) {
    process.stderr.write(`${INSTALL_HINT}\n`);
    process.exit(127);
  }
  return bin;
}

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function taskFlags(flags, bin) {
  if (flags.model) validateModel(bin, flags.model);
  if (flags.effort) validateEffort(flags.effort);
  return {
    model: flags.model,
    effort: flags.effort,
    fullAccess: Boolean(flags['full-access']),
  };
}

function streamAgy(bin, agyArgs) {
  const r = spawnSync(bin, agyArgs, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function cmdSetup() {
  const bin = findAgy();
  if (!bin) {
    emit({
      ready: false,
      agy: { available: false, path: null, version: null },
      auth: { status: authStatus() },
      models: null,
      error: INSTALL_HINT,
    });
    return;
  }
  const auth = authStatus();
  const models = listModels(bin);
  const ready = auth !== 'missing' && models !== null;
  emit({
    ready,
    agy: { available: true, path: bin, version: agyVersion(bin) },
    auth: { status: auth },
    models: models ? { count: models.length } : null,
    error: ready
      ? null
      : auth === 'missing'
        ? 'agy is not authenticated. Run `agy` once interactively, or set ANTIGRAVITY_API_KEY.'
        : 'could not list models from agy.',
  });
}

function cmdModels() {
  const bin = requireAgy();
  const r = spawnSync(bin, ['models'], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function cmdRun(argv) {
  const { flags, positional } = parseArgs(argv, {
    model: 'value',
    effort: 'value',
    'full-access': 'flag',
    continue: 'flag',
    conversation: 'value',
  });
  const prompt = positional.join(' ').trim();
  if (!prompt) throw new UsageError('run requires a prompt');
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  streamAgy(bin, buildAgyArgs({
    prompt,
    ...opts,
    sandbox: true,
    continueLast: Boolean(flags.continue),
    conversation: flags.conversation,
  }));
}

const REVIEW_INTRO = `You are a senior engineer performing a read-only code review.
Review the diff below for correctness, edge cases, security issues, and
maintainability. Report findings as a prioritized list; each finding needs
file/line, a one-sentence problem statement, and a concrete failure scenario.
Say "no significant findings" if the diff is clean. Do not modify any files.`;

const ADVERSARIAL_INTRO = `You are an adversarial reviewer. Your job is to challenge this change:
question the design decisions, hunt for hidden assumptions, argue where a
simpler or safer approach exists, and probe edge cases the author likely
missed. Be specific and technical, not contrarian for its own sake. Findings
need file/line and a concrete scenario. Do not modify any files.`;

function cmdReview(argv) {
  const { flags, positional } = parseArgs(argv, {
    adversarial: 'flag',
    model: 'value',
    effort: 'value',
  });
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  let diff = spawnSync('git', ['diff', 'HEAD'], { encoding: 'utf8' }).stdout || '';
  if (!diff.trim()) {
    diff = spawnSync('git', ['diff'], { encoding: 'utf8' }).stdout || '';
  }
  if (!diff.trim()) {
    process.stderr.write('no changes to review (git diff HEAD and git diff are both empty)\n');
    process.exit(1);
  }
  const intro = flags.adversarial ? ADVERSARIAL_INTRO : REVIEW_INTRO;
  const focus = positional.join(' ').trim();
  const prompt = [
    intro,
    focus ? `\nReviewer focus: ${focus}` : '',
    '\nDiff:\n```diff\n' + diff + '\n```',
  ].join('\n');
  streamAgy(bin, buildAgyArgs({ prompt, ...opts, fullAccess: false, sandbox: true }));
}

const COMMANDS = {
  setup: () => cmdSetup(),
  models: () => cmdModels(),
  run: (argv) => cmdRun(argv),
  review: (argv) => cmdReview(argv),
};

const [subcommand, ...rest] = process.argv.slice(2);
try {
  const handler = COMMANDS[subcommand];
  if (!handler) {
    throw new UsageError(
      `unknown subcommand "${subcommand ?? ''}". Known: ${Object.keys(COMMANDS).join(', ')}`,
    );
  }
  await handler(rest); // top-level await: handlers may be async (job-cancel)
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(64);
  }
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/companion-core.test.mjs`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/agy-companion.mjs tests/companion-core.test.mjs
git commit -m "feat: companion entrypoint with setup, models, run, review"
```

---

### Task 8: Companion job subcommands

**Files:**
- Modify: `plugins/agy/scripts/agy-companion.mjs` (add imports, four handlers, dispatch entries)
- Test: `tests/companion-jobs.test.mjs`

**Interfaces:**
- Consumes: `startJob, getJob, jobState, listJobs, jobResult, cancelJob` from `./lib/jobs.mjs`; `taskFlags`, `requireAgy`, `emit`, `parseArgs` already in the companion
- Produces CLI subcommands:
  - `job-start [--model M] [--effort E] [--full-access] <task>` → JSON `{ jobId, state: 'running', task }`
  - `job-status [id]` → JSON: with id `{ id, state, task, model, createdAt }`; without id `{ jobs: [ ...same fields... ] }`
  - `job-result <id>` → JSON `{ id, state, exitCode, output, conversationId }`
  - `job-cancel <id>` → JSON `{ id, state: 'cancelled' }`

- [ ] **Step 1: Write the failing test**

`tests/companion-jobs.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANION = join(ROOT, 'plugins/agy/scripts/agy-companion.mjs');
const FAKE = join(ROOT, 'tests/fake-agy');
const STATE = mkdtempSync(join(tmpdir(), 'agy-cjobs-'));

function run(args, extraEnv = {}) {
  return spawnSync('node', [COMPANION, ...args], {
    encoding: 'utf8',
    env: { ...process.env, AGY_BIN: FAKE, AGY_PLUGIN_STATE_DIR: STATE, ...extraEnv },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitDone(id, timeoutMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const j = JSON.parse(run(['job-status', id]).stdout);
    if (j.state !== 'running') return j.state;
    await sleep(50);
  }
  throw new Error('job did not finish');
}

test('job lifecycle: start -> status -> result', async () => {
  const started = JSON.parse(run(['job-start', 'summarize the repo']).stdout);
  assert.match(started.jobId, /^job-/);
  assert.equal(started.state, 'running');
  const state = await waitDone(started.jobId);
  assert.equal(state, 'done');
  const result = JSON.parse(run(['job-result', started.jobId]).stdout);
  assert.match(result.output, /fake-agy: summarize the repo/);
  assert.equal(result.conversationId, 'conv-fake-1234');
  const list = JSON.parse(run(['job-status']).stdout);
  assert.ok(list.jobs.some((j) => j.id === started.jobId));
});

test('job-cancel stops a running job', async () => {
  const started = JSON.parse(
    run(['job-start', 'slow task'], { FAKE_AGY_SLEEP_MS: '10000' }).stdout,
  );
  await sleep(200);
  const cancelled = JSON.parse(run(['job-cancel', started.jobId]).stdout);
  assert.equal(cancelled.state, 'cancelled');
  const status = JSON.parse(run(['job-status', started.jobId]).stdout);
  assert.equal(status.state, 'cancelled');
});

test('job-start validates model; job-result/cancel require known id', () => {
  assert.equal(run(['job-start', '--model', 'gpt-99', 'x']).status, 64);
  assert.equal(run(['job-result', 'job-nope']).status, 64);
  assert.equal(run(['job-cancel', 'job-nope']).status, 64);
  assert.equal(run(['job-result']).status, 64);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/companion-jobs.test.mjs`
Expected: FAIL — `unknown subcommand "job-start"` → exit 64, JSON.parse errors in tests

- [ ] **Step 3: Implement**

In `plugins/agy/scripts/agy-companion.mjs`, add to the imports:

```js
import { startJob, listJobs, getJob, jobState, jobResult, cancelJob } from './lib/jobs.mjs';
```

Add the handlers (above the `COMMANDS` table):

```js
function cmdJobStart(argv) {
  const { flags, positional } = parseArgs(argv, {
    model: 'value',
    effort: 'value',
    'full-access': 'flag',
  });
  const task = positional.join(' ').trim();
  if (!task) throw new UsageError('job-start requires a task');
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  const meta = startJob(bin, task, opts);
  emit({ jobId: meta.id, state: 'running', task: meta.task });
}

const jobSummary = (meta) => ({
  id: meta.id,
  state: meta.state ?? jobState(meta),
  task: meta.task,
  model: meta.model,
  createdAt: meta.createdAt,
});

function cmdJobStatus(argv) {
  const { positional } = parseArgs(argv, {});
  if (positional[0]) {
    emit(jobSummary(getJob(positional[0])));
  } else {
    emit({ jobs: listJobs().map(jobSummary) });
  }
}

function cmdJobResult(argv) {
  const { positional } = parseArgs(argv, {});
  if (!positional[0]) throw new UsageError('job-result requires a job id');
  emit(jobResult(positional[0]));
}

async function cmdJobCancel(argv) {
  const { positional } = parseArgs(argv, {});
  if (!positional[0]) throw new UsageError('job-cancel requires a job id');
  emit(await cancelJob(positional[0]));
}
```

Extend the dispatch table:

```js
const COMMANDS = {
  setup: () => cmdSetup(),
  models: () => cmdModels(),
  run: (argv) => cmdRun(argv),
  review: (argv) => cmdReview(argv),
  'job-start': (argv) => cmdJobStart(argv),
  'job-status': (argv) => cmdJobStatus(argv),
  'job-result': (argv) => cmdJobResult(argv),
  'job-cancel': (argv) => cmdJobCancel(argv),
};
```

- [ ] **Step 4: Run tests to verify they pass (including no regressions)**

Run: `node --test tests/`
Expected: PASS — all suites (args, agy, jobs, transcript, session-hook, companion-core, companion-jobs)

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/agy-companion.mjs tests/companion-jobs.test.mjs
git commit -m "feat: companion job-start/status/result/cancel subcommands"
```

---

### Task 9: Companion transfer subcommand

**Files:**
- Modify: `plugins/agy/scripts/agy-companion.mjs` (add transfer handler + dispatch entry)
- Test: `tests/companion-transfer.test.mjs`

**Interfaces:**
- Consumes: `latestSession, extractTurns, buildHandoffPrompt` from `./lib/transcript.mjs`; `stateDir` from `./lib/jobs.mjs`; `extractConversationId` from `./lib/jobs.mjs`
- Produces CLI subcommand: `transfer [--model M] [--effort E]` → JSON `{ conversationId: string|null, turns: number, response: string }`. Exit 1 with message if no session/transcript is known. Runs agy sandboxed with a per-call `--log-file` under `stateDir()/transfer/` to recover the conversation id.

- [ ] **Step 1: Write the failing test**

`tests/companion-transfer.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANION = join(ROOT, 'plugins/agy/scripts/agy-companion.mjs');
const FAKE = join(ROOT, 'tests/fake-agy');

function run(args, stateDirPath, cwd = ROOT) {
  return spawnSync('node', [COMPANION, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, AGY_BIN: FAKE, AGY_PLUGIN_STATE_DIR: stateDirPath },
  });
}

test('transfer with no known session fails with guidance', () => {
  const state = mkdtempSync(join(tmpdir(), 'agy-tx-'));
  const r = run(['transfer'], state);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no claude session/i);
});

test('transfer builds handoff, runs agy, returns conversation id', () => {
  const state = mkdtempSync(join(tmpdir(), 'agy-tx-'));
  const transcript = join(state, 'transcript.jsonl');
  writeFileSync(transcript, [
    JSON.stringify({ type: 'user', message: { content: 'fix the login bug' } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'found it in auth.ts' }] } }),
  ].join('\n'));
  mkdirSync(join(state, 'sessions'), { recursive: true });
  writeFileSync(
    join(state, 'sessions', 'sess-9.json'),
    JSON.stringify({
      sessionId: 'sess-9',
      transcriptPath: transcript,
      cwd: ROOT,
      updatedAt: new Date().toISOString(),
    }),
  );
  const r = run(['transfer'], state);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.conversationId, 'conv-fake-1234');
  assert.equal(j.turns, 2);
  assert.match(j.response, /taking over a coding session/);
  assert.match(j.response, /mode=sandbox/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/companion-transfer.test.mjs`
Expected: FAIL — `unknown subcommand "transfer"` → exit 64

- [ ] **Step 3: Implement**

In `plugins/agy/scripts/agy-companion.mjs`, add to imports:

```js
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir, extractConversationId } from './lib/jobs.mjs';
import { latestSession, extractTurns, buildHandoffPrompt } from './lib/transcript.mjs';
import { readFileSync, existsSync } from 'node:fs';
```

(Merge with any existing imports from the same modules.)

Add the handler:

```js
function cmdTransfer(argv) {
  const { flags } = parseArgs(argv, { model: 'value', effort: 'value' });
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  const session = latestSession(process.cwd());
  if (!session || !existsSync(session.transcriptPath)) {
    process.stderr.write(
      'no Claude session transcript is known yet. The SessionStart hook records it; start a fresh session (or /reload-plugins) and try again.\n',
    );
    process.exit(1);
  }
  const turns = extractTurns(session.transcriptPath, {});
  if (!turns.length) {
    process.stderr.write('the session transcript has no text turns to transfer.\n');
    process.exit(1);
  }
  const prompt = buildHandoffPrompt(turns, session.cwd);
  const logDir = join(stateDir(), 'transfer');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `transfer-${Date.now()}.log`);
  const r = spawnSync(bin, buildAgyArgs({
    prompt, ...opts, fullAccess: false, sandbox: true, logFile,
  }), { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || `agy exited ${r.status}\n`);
    process.exit(r.status ?? 1);
  }
  const conversationId = existsSync(logFile)
    ? extractConversationId(readFileSync(logFile, 'utf8'))
    : null;
  emit({ conversationId, turns: turns.length, response: (r.stdout || '').trim() });
}
```

Add to the dispatch table:

```js
  transfer: (argv) => cmdTransfer(argv),
```

- [ ] **Step 4: Run all tests**

Run: `node --test tests/`
Expected: PASS — every suite

- [ ] **Step 5: Commit**

```bash
git add plugins/agy/scripts/agy-companion.mjs tests/companion-transfer.test.mjs
git commit -m "feat: companion transfer subcommand with conversation id recovery"
```

---

### Task 10: Slash commands and runner agent

**Files:**
- Create: `plugins/agy/commands/setup.md`
- Create: `plugins/agy/commands/review.md`
- Create: `plugins/agy/commands/adversarial-review.md`
- Create: `plugins/agy/commands/delegate.md`
- Create: `plugins/agy/commands/status.md`
- Create: `plugins/agy/commands/result.md`
- Create: `plugins/agy/commands/cancel.md`
- Create: `plugins/agy/commands/resume.md`
- Create: `plugins/agy/commands/transfer.md`
- Create: `plugins/agy/commands/models.md`
- Create: `plugins/agy/agents/agy-runner.md`

**Interfaces:**
- Consumes: the companion CLI contract from Tasks 7–9 (exact subcommands and flags)
- Produces: the user-facing `/agy:*` surface and the `agy:agy-runner` subagent that `/agy:delegate` dispatches to in foreground mode

- [ ] **Step 1: Write the command files**

`plugins/agy/commands/setup.md`:

```markdown
---
description: Check that the Antigravity CLI (agy) is installed and authenticated; offer install if missing
allowed-tools: Bash(node:*), Bash(curl:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" setup
```

Interpret the JSON:

- `ready: true` — report readiness in one short line (version, auth status, model count).
- `agy.available: false` — use AskUserQuestion once to offer running the official
  installer (`curl -fsSL https://antigravity.google/cli/install.sh | bash`), option
  "Install agy now (Recommended)" first, then "Skip for now". If installed, re-run
  the setup command above.
- `auth.status: "missing"` — tell the user to run `!agy` once interactively (OAuth)
  or export `ANTIGRAVITY_API_KEY`, then re-run `/agy:setup`. Do not attempt to
  authenticate for them.
```

`plugins/agy/commands/review.md`:

```markdown
---
description: Read-only Antigravity (Gemini) review of the current working-tree diff
argument-hint: "[--model <name>] [--effort low|medium|high] [focus]"
allowed-tools: Bash(node:*)
---

Run (pass the user's arguments through verbatim):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review $ARGUMENTS
```

This is sandboxed and read-only; agy sees only the diff. Present agy's findings
verbatim, then add a short section of your own take: which findings you agree
with, which you'd push back on, and why. If it exits with "no changes to
review", tell the user there is nothing to review.
```

`plugins/agy/commands/adversarial-review.md`:

```markdown
---
description: Adversarial Antigravity (Gemini) review that challenges the design of the current diff
argument-hint: "[--model <name>] [--effort low|medium|high] [stance]"
allowed-tools: Bash(node:*)
---

Run (pass the user's arguments through verbatim, keeping --adversarial first):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" review --adversarial $ARGUMENTS
```

Sandboxed and read-only. Present agy's challenge verbatim, then respond to it
honestly: concede the points that land, rebut the ones that don't, with
reasoning. Do not perform agreement.
```

`plugins/agy/commands/delegate.md`:

```markdown
---
description: Delegate a task to the Antigravity CLI (agy); use --background for long tasks
argument-hint: "[--background] [--full-access] [--model <name>] [--effort low|medium|high] <task>"
allowed-tools: Bash(node:*), Agent
---

Raw request: $ARGUMENTS

- If it contains `--background`: strip that flag and run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-start <remaining args>`
  via Bash, then report the returned `jobId` and mention `/agy:status`,
  `/agy:result`, `/agy:cancel`.
- Otherwise: dispatch the `agy:agy-runner` subagent with the full remaining
  argument string as its task. Return its output verbatim.
- Tasks run sandboxed unless the user passed `--full-access` (which maps to
  agy's --dangerously-skip-permissions). Never add `--full-access` yourself.
- If no task text is present, ask the user what to delegate.
```

`plugins/agy/commands/status.md`:

```markdown
---
description: Show Antigravity background jobs (all, or one by id)
argument-hint: "[job-id]"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-status $ARGUMENTS
```

Render the JSON as a compact table: id, state, model, created, task (truncate
long tasks). If a job is `done` or `failed`, point at `/agy:result <id>`.
```

`plugins/agy/commands/result.md`:

```markdown
---
description: Show the output of an Antigravity background job
argument-hint: "<job-id>"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-result $ARGUMENTS
```

Present the `output` field verbatim. If `conversationId` is non-null, mention
the thread can be continued with `/agy:resume <conversationId> <follow-up>`.
If state is `running`, say so and suggest `/agy:status`.
```

`plugins/agy/commands/cancel.md`:

```markdown
---
description: Cancel a running Antigravity background job
argument-hint: "<job-id>"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" job-cancel $ARGUMENTS
```

Confirm cancellation from the JSON. Unknown ids exit 64 and list known ids —
relay that to the user.
```

`plugins/agy/commands/resume.md`:

```markdown
---
description: Continue a previous Antigravity conversation
argument-hint: "[conversation-id] <follow-up>"
allowed-tools: Bash(node:*)
---

Raw request: $ARGUMENTS

- If the first token looks like a conversation id (e.g. starts with `conv` or
  came from /agy:result), run:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run --conversation <id> <rest>`
- Otherwise continue the most recent conversation:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run --continue $ARGUMENTS`

Return agy's response verbatim. If no follow-up text was given, ask for one.
```

`plugins/agy/commands/transfer.md`:

```markdown
---
description: Hand the current Claude Code session context to a new Antigravity conversation
argument-hint: "[--model <name>]"
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" transfer $ARGUMENTS
```

From the JSON: report how many turns were transferred, show agy's acknowledgement
(`response`), and give the user the `conversationId` with the exact follow-up
command: `/agy:resume <conversationId> <your next message>`. If it fails because
no session is known, explain the SessionStart hook records transcripts and a
fresh session is needed.
```

`plugins/agy/commands/models.md`:

```markdown
---
description: List models available to the Antigravity CLI
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" models
```

Show the list verbatim. Mention any command accepts `--model <name>` and
`--effort low|medium|high`.
```

`plugins/agy/agents/agy-runner.md`:

```markdown
---
name: agy-runner
description: Forward a delegated task to the Google Antigravity CLI (agy) and return its output verbatim. Use when /agy:delegate runs a foreground task, or when the user says "ask agy", "delegate to antigravity", or "let Gemini take this".
tools: Bash
---

You are a thin forwarding wrapper around the local Antigravity CLI.

Make exactly one Bash call:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/agy-companion.mjs" run [flags] "<task>"
```

- Forward `--model`, `--effort`, and `--full-access` flags if they were in the
  task string; everything else is the task text, preserved verbatim.
- Never add `--full-access` on your own initiative.
- Return the command's stdout exactly as it came back — no paraphrasing, no
  commentary, no follow-up actions. If it fails, return the error output and
  exit code as-is.
```

- [ ] **Step 2: Structural verification**

Run: `ls plugins/agy/commands | wc -l && ls plugins/agy/agents`
Expected: `10` and `agy-runner.md`

Run: `node --test tests/`
Expected: PASS (no code changed; guards against accidental edits)

- [ ] **Step 3: Commit**

```bash
git add plugins/agy/commands plugins/agy/agents
git commit -m "feat: slash commands and runner agent"
```

---

### Task 11: README, CI, and full-suite gate

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (replace stub)

**Interfaces:**
- Consumes: everything — this task documents and gates it
- Produces: user-facing docs; CI on pushes and PRs

- [ ] **Step 1: Write CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - name: Syntax check
        run: |
          for f in $(find plugins tests -name '*.mjs') tests/fake-agy; do
            node --check "$f"
          done
      - name: Tests
        run: node --test tests/
```

- [ ] **Step 2: Write the README**

`README.md`:

```markdown
# agy-plugin-cc

Use the Google Antigravity CLI (`agy`) from inside Claude Code — delegate
tasks, get cross-model code reviews, run background jobs, and continue
Antigravity conversations without leaving your session.

Modeled on the UX of [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc),
minus the app-server: agy has no server mode, so background jobs are detached
`agy -p` processes tracked in a file-based registry.

## Requirements

- [Antigravity CLI](https://antigravity.google) installed and authenticated
  (OAuth via running `agy` once, or `ANTIGRAVITY_API_KEY`)
- Node.js >= 18.18
- macOS / Linux / WSL

## Install

```
/plugin marketplace add jakeryderv/agy-plugin-cc
/plugin install agy@agy-plugin-cc
/reload-plugins
/agy:setup
```

## Commands

| Command | What it does |
|---|---|
| `/agy:setup` | Verify agy install + auth |
| `/agy:review [focus]` | Read-only, sandboxed review of your working-tree diff |
| `/agy:adversarial-review [stance]` | Steerable review that challenges the design |
| `/agy:delegate <task>` | Hand a task to agy; `--background` runs it as a job |
| `/agy:status [id]` | List background jobs / job detail |
| `/agy:result <id>` | Job output + conversation id for resuming |
| `/agy:cancel <id>` | Stop a running job |
| `/agy:resume [id] <follow-up>` | Continue the last (or a specific) agy conversation |
| `/agy:transfer` | Seed a new agy conversation from your Claude session |
| `/agy:models` | List available models |

Every task command accepts `--model <name>` (validated against live
`agy models` output) and `--effort low|medium|high`.

## Safety model

- Reviews always run `agy --sandbox`; agy sees the diff only.
- Delegated tasks are sandboxed by default. `--full-access` (maps to agy's
  `--dangerously-skip-permissions`) must be passed explicitly by you; the
  plugin never adds it.
- The plugin only invokes your local `agy` binary with your existing auth; it
  never touches credentials.

## State

Jobs and session pointers live under `~/.agy-plugin/` (override with
`AGY_PLUGIN_STATE_DIR`). Job directories older than 7 days are pruned
automatically.

## Development

```
node --test tests/
```

Zero npm dependencies. Tests run against `tests/fake-agy`, never the real CLI.

## License

MIT
```

- [ ] **Step 3: Full-suite gate**

Run: `for f in $(find plugins tests -name '*.mjs') tests/fake-agy; do node --check "$f" || exit 1; done && node --test tests/`
Expected: all syntax checks pass, all tests PASS

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "docs: README; ci: node 18/24 syntax + test workflow"
```

---

### Task 12: Publish and live verification

**Files:**
- No new files; publishes the repo and installs the plugin locally

**Interfaces:**
- Consumes: the complete repo
- Produces: public `github.com/jakeryderv/agy-plugin-cc`; plugin installed as `agy@agy-plugin-cc`

- [ ] **Step 1: Create the GitHub repo and push**

```bash
cd ~/dev/projects/agy-plugin-cc
gh repo create jakeryderv/agy-plugin-cc --public --source=. --push \
  --description "Use the Google Antigravity CLI (agy) from Claude Code — delegate tasks, cross-model reviews, background jobs."
```

Expected: repo created, main pushed.

- [ ] **Step 2: Verify CI is green**

Run: `gh run watch --repo jakeryderv/agy-plugin-cc --exit-status` (or `gh run list --repo jakeryderv/agy-plugin-cc` until the ci run completes)
Expected: ci workflow concluded `success`.

- [ ] **Step 3: Install locally**

```bash
claude plugin marketplace add jakeryderv/agy-plugin-cc
claude plugin install agy@agy-plugin-cc
```

Expected: `Installed agy`.

- [ ] **Step 4: Live smoke test against real agy (read-only only)**

```bash
node ~/.claude/plugins/cache/agy-plugin-cc/agy/0.1.0/scripts/agy-companion.mjs setup
node ~/.claude/plugins/cache/agy-plugin-cc/agy/0.1.0/scripts/agy-companion.mjs models
```

Expected: setup JSON with `ready: true`, real version and `auth.status` of
`oauth` or `api-key`; models list matching `agy models`. (Exact cache path may
vary — find it with `claude plugin list` if needed.)

Then a minimal real run (sandboxed, harmless):

```bash
node ~/.claude/plugins/cache/agy-plugin-cc/agy/0.1.0/scripts/agy-companion.mjs run "Reply with exactly: agy-plugin-cc smoke ok"
```

Expected: a response from Gemini containing the smoke phrase.

- [ ] **Step 5: Hand back to the user**

Report install status and remind: `/reload-plugins` then `/agy:setup` in their
session; suggest `/agy:review` on a real diff as the first meaningful use.

---

## Self-review notes

- Spec coverage: setup/review/adversarial/delegate/jobs/resume/transfer/models
  commands → Tasks 7–10; job registry semantics incl. exit-code wrapper,
  pruning, cancel → Task 4; hook → Task 6; transcript → Task 5; safety
  (sandbox default, --full-access explicit) → Tasks 3/4/7 tests; error codes
  0/1/64/127 → Tasks 7–9 tests; CI + README → Task 11; publish → Task 12.
- Deliberately not built (spec out-of-scope): review gate, image/research,
  Windows, daemon.
- Type consistency: companion consumes `startJob(bin, task, opts)`,
  `jobResult(id)`, `latestSession(cwd)`, `extractTurns(path, opts)`,
  `buildHandoffPrompt(turns, cwd)` exactly as defined in Tasks 4–5.
```

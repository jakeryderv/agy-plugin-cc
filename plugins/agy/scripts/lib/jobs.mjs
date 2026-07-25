import {
  mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
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

// Grace period before pruning a job dir with missing/corrupt meta.json —
// covers the window in startJob() between mkdirSync and the meta write.
const CORRUPT_META_GRACE_MS = 3600 * 1000;

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
    } catch (err) {
      // Only missing meta (UsageError) or unparseable meta (SyntaxError) mark
      // a dir as garbage; a transient read error must not delete a valid job.
      if (err instanceof UsageError || err instanceof SyntaxError) {
        try {
          const s = statSync(jobDir(id));
          if (s.isDirectory() && s.mtimeMs < Date.now() - CORRUPT_META_GRACE_MS) {
            rmSync(jobDir(id), { recursive: true, force: true });
          }
        } catch { /* pruning failures must not break listing */ }
      }
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

// agy records its conversation id as a canonical UUID on log lines that
// mention "conversation" (`Created conversation <uuid>`, `conversation=<uuid>`)
// — never as `conversation_id=<x>`. See the REAL_AGY_LOG fixture in
// tests/jobs.test.mjs for the reference format.
//
// Matching is line-scoped and requires the UUID shape, which is what keeps the
// empty `conversationID=""` startup line from pairing with a token on the
// following line. Returning null for anything unrecognized is deliberate: a
// wrong id sends --conversation to a nonexistent thread, which is worse for the
// user than being told no id was found.
const CONVERSATION_UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractConversationId(text) {
  let match = null;
  for (const line of String(text ?? '').split('\n')) {
    if (!/conversation/i.test(line)) continue;
    const m = line.match(CONVERSATION_UUID_RE);
    if (m) match = m[0]; // last conversation referenced wins
  }
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
  const state = jobState(meta);
  if (state !== 'running') {
    return { id, state };
  }
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
  meta.cancelled = true;
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
  return { id, state: 'cancelled' };
}

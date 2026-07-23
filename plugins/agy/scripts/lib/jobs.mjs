import {
  mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync,
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

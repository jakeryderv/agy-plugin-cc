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
  const r = cancelJob(meta.id);
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

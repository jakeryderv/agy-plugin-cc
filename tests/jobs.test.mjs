import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, utimesSync,
} from 'node:fs';
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
  assert.equal(r.conversationId, 'facade00-1111-4222-8333-444455556666');
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

test('cancelJob on a finished job preserves its terminal state', async () => {
  const meta = startJob(FAKE, 'quick task', {});
  await waitDone(meta.id);
  const r = await cancelJob(meta.id);
  assert.equal(r.state, 'done');
  assert.equal(jobState(getJob(meta.id)), 'done');
  assert.equal(jobResult(meta.id).exitCode, 0);
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

test('listJobs prunes corrupt/missing-meta dirs past grace period, spares fresh ones', async () => {
  const root = join(stateDir(), 'jobs');
  const stale = new Date(Date.now() - 2 * 3600 * 1000); // past the 1h grace period

  const corrupt = join(root, 'job-corrupt-meta');
  mkdirSync(corrupt, { recursive: true });
  writeFileSync(join(corrupt, 'meta.json'), 'not json {');
  utimesSync(corrupt, stale, stale);

  const metaless = join(root, 'job-missing-meta');
  mkdirSync(metaless, { recursive: true });
  utimesSync(metaless, stale, stale);

  const freshMetaless = join(root, 'job-fresh-no-meta');
  mkdirSync(freshMetaless, { recursive: true });

  const strayFile = join(root, 'stray.txt');
  writeFileSync(strayFile, 'not a job');
  utimesSync(strayFile, stale, stale);

  const valid = startJob(FAKE, 'valid job', {});
  await waitDone(valid.id);

  const jobs = listJobs();
  assert.ok(!existsSync(corrupt));
  assert.ok(!existsSync(metaless));
  assert.ok(existsSync(freshMetaless));
  assert.ok(existsSync(strayFile));
  assert.ok(jobs.some((j) => j.id === valid.id));
  assert.ok(!jobs.some((j) => ['job-corrupt-meta', 'job-missing-meta', 'job-fresh-no-meta'].includes(j.id)));
});

test('getJob unknown id throws', async () => {
  const { UsageError } = await import('../plugins/agy/scripts/lib/args.mjs');
  assert.throws(() => getJob('job-nope'), UsageError);
});

// Verbatim excerpt of a real agy 1.1.7 --log-file, captured from a background
// job during the v0.1.0 smoke pass. Kept literal on purpose: the original
// extractConversationId was written against a synthetic `conversation_id=x`
// format agy never emits, which is how it passed tests while returning garbage
// against every real log.
const REAL_AGY_LOG = [
  'I0725 10:47:15.230593 100946 printmode.go:108] Print mode: starting (promptLength=50, model="gemini-3.6-flash-low", conversationID="")',
  'I0725 10:47:17.710700 100946 conversation_manager.go:373] Starting new conversation (agent=false)',
  'I0725 10:47:17.727463 100946 server.go:997] Created conversation 64bb96ef-8a49-4c85-9d5b-c321f9ee6512',
  'I0725 10:47:17.727898 100946 conversation_manager.go:420] project: switching to conversation belonging to project ID: default-cli-project',
  'I0725 10:47:17.728205 100946 printmode.go:232] Print mode: conversation=64bb96ef-8a49-4c85-9d5b-c321f9ee6512, sending message',
].join('\n');

const UUID_A = '64bb96ef-8a49-4c85-9d5b-c321f9ee6512';
const UUID_B = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

test('extractConversationId recovers the id from a real agy log', () => {
  assert.equal(extractConversationId(REAL_AGY_LOG), UUID_A);
});

test('extractConversationId never returns a non-id token', () => {
  // The empty `conversationID=""` decoy plus the next line's glog prefix is
  // exactly what made the old pattern return 'I0725' on every real run.
  const decoy = [
    'I0725 10:47:15.230593 100946 printmode.go:108] Print mode: starting (conversationID="")',
    'I0725 10:47:15.230600 100946 server.go:545] Language server will attempt to listen',
  ].join('\n');
  assert.equal(extractConversationId(decoy), null);
  assert.notEqual(extractConversationId(REAL_AGY_LOG), 'I0725');
});

test('extractConversationId returns null when no id is present', () => {
  assert.equal(extractConversationId(''), null);
  assert.equal(extractConversationId('nothing here'), null);
  // A conversation UUID must be a UUID — a bare word is not an id.
  assert.equal(extractConversationId('Created conversation banana'), null);
});

test('extractConversationId returns the last conversation referenced', () => {
  const two = [
    `I0725 10:47:17.727463 100946 server.go:997] Created conversation ${UUID_A}`,
    `I0725 10:47:19.100000 100946 conversation_manager.go:587] Streaming conversation ${UUID_B}`,
  ].join('\n');
  assert.equal(extractConversationId(two), UUID_B);
});

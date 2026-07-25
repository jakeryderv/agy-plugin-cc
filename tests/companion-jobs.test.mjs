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
  assert.equal(result.conversationId, 'facade00-1111-4222-8333-444455556666');
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

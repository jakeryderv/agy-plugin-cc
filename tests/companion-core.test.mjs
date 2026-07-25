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

// Real agy rejects every --model/--effort pairing, so catching it locally
// saves a live call and explains what to do instead.
test('model plus effort is rejected before agy is invoked', () => {
  for (const args of [
    ['run', '--model', 'fake-pro', '--effort', 'high', 'hi'],
    ['job-start', '--model', 'fake-pro', '--effort', 'low', 'hi'],
    ['review', '--model', 'fake-pro', '--effort', 'medium'],
  ]) {
    const r = run(args);
    assert.equal(r.status, 64, `expected 64 for ${args.join(' ')}, got ${r.status}`);
    assert.match(r.stderr, /--model/);
    assert.match(r.stderr, /--effort/);
    // fake-agy echoes its prompt; absence proves no run was attempted.
    assert.doesNotMatch(r.stdout, /fake-agy:/);
  }
});

test('either flag alone still runs', () => {
  const withModel = run(['run', '--model', 'fake-pro', 'hi']);
  assert.equal(withModel.status, 0);
  const withEffort = run(['run', '--effort', 'high', 'hi']);
  assert.equal(withEffort.status, 0);
});

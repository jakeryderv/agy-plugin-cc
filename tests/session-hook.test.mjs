import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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

// session_id was interpolated straight into a path; "../../escaped" wrote
// outside the state root entirely.
test('path-traversing session_id writes nothing, anywhere', () => {
  // The state dir is nested so that a `../../` escape lands inside this test's
  // own temp tree. Asserting on a path outside it (e.g. /tmp/escaped.json)
  // would pick up unrelated files and fail for the wrong reason.
  const root = mkdtempSync(join(tmpdir(), 'agy-hook-'));
  const dir = join(root, 'nested', 'state');
  mkdirSync(dir, { recursive: true });

  for (const evil of ['../../escaped', '../sibling', 'a/b', '..', '.', '', 'x/../../y']) {
    const r = runHook(
      JSON.stringify({ session_id: evil, transcript_path: '/tmp/t.jsonl', cwd: '/proj' }),
      dir,
    );
    assert.equal(r.status, 0, `hook must still exit 0 for ${JSON.stringify(evil)}`);
    const escaped = resolve(join(dir, 'sessions'), `${evil}.json`);
    assert.ok(
      !existsSync(escaped),
      `wrote outside the sessions dir for ${JSON.stringify(evil)}: ${escaped}`,
    );
  }
  // Nothing legitimate was created either, and nothing leaked up the tree.
  assert.ok(!existsSync(join(dir, 'sessions')) || readdirSync(join(dir, 'sessions')).length === 0);
  assert.deepEqual(readdirSync(root), ['nested']);
  assert.deepEqual(readdirSync(join(root, 'nested')), ['state']);
});

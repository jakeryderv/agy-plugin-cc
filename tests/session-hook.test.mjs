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

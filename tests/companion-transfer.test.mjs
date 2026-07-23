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

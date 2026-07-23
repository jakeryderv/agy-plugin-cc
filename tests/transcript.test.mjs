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

test('latestSession prefers cwd match, null when no match', () => {
  writeSession('s-old', '/proj/a', '2026-07-01T00:00:00Z');
  writeSession('s-new', '/proj/b', '2026-07-22T00:00:00Z');
  assert.equal(latestSession('/proj/a').sessionId, 's-old');
  assert.equal(latestSession('/proj/zzz'), null);
});

test('latestSession prefers CLAUDE_SESSION_ID when set', () => {
  process.env.CLAUDE_SESSION_ID = 's-old';
  assert.equal(latestSession('/proj/b').sessionId, 's-old');
  delete process.env.CLAUDE_SESSION_ID;
});

test('latestSession falls through when CLAUDE_SESSION_ID file is corrupt', () => {
  writeFileSync(join(sessionsDir, 's-corrupt.json'), '{not json');
  process.env.CLAUDE_SESSION_ID = 's-corrupt';
  try {
    assert.equal(latestSession('/proj/b').sessionId, 's-new');
  } finally {
    delete process.env.CLAUDE_SESSION_ID;
  }
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

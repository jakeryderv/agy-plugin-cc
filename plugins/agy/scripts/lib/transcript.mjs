import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './jobs.mjs';

// A session id becomes a filename, so it must already be one. Ids come from
// Claude Code (UUIDs), but interpolating an unchecked value into a path let
// `../../escaped` write outside the state root entirely. Refused rather than
// sanitized: rewriting an id into a safe form would let the writer and the
// reader disagree about which file a session lives in.
export function isSafeSessionId(id) {
  return typeof id === 'string'
    && id.length > 0
    && id !== '.'
    && id !== '..'
    && !id.includes('/')
    && !id.includes('\\')
    && !id.includes('\0');
}

export function latestSession(cwd) {
  const dir = join(stateDir(), 'sessions');
  if (!existsSync(dir)) return null;
  const sid = process.env.CLAUDE_SESSION_ID;
  if (isSafeSessionId(sid) && existsSync(join(dir, `${sid}.json`))) {
    try {
      return JSON.parse(readFileSync(join(dir, `${sid}.json`), 'utf8'));
    } catch { /* corrupt env-matched file: fall through to the scan */ }
  }
  const sessions = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      sessions.push(JSON.parse(readFileSync(join(dir, f), 'utf8')));
    } catch { /* skip corrupt */ }
  }
  if (!sessions.length) return null;
  const pool = sessions.filter((s) => s.cwd === cwd);
  if (!pool.length) return null;
  const pick = pool.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return pick[0];
}

export function extractTurns(transcriptPath, { maxTurns = 30, maxBytes = 16000 } = {}) {
  const turns = [];
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    const content = entry.message?.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
    text = text.trim();
    if (!text) continue;
    turns.push({ role: entry.type, text });
  }
  // Encoded bytes, not string length: the budget is there to bound the prompt,
  // and JS string length undercounts every non-Latin character (3x for CJK,
  // 4x for astral pairs).
  const size = (t) => Buffer.byteLength(t.text, 'utf8');
  let selected = turns.slice(-maxTurns);
  let total = selected.reduce((n, t) => n + size(t), 0);
  while (selected.length > 1 && total > maxBytes) {
    total -= size(selected[0]);
    selected = selected.slice(1);
  }
  return selected;
}

export function buildHandoffPrompt(turns, cwd) {
  const body = turns
    .map((t) => `${t.role.toUpperCase()}:\n${t.text}`)
    .join('\n\n---\n\n');
  return [
    'You are taking over a coding session from another assistant.',
    `Working directory: ${cwd}`,
    'Below is the recent conversation transcript. Read it, briefly acknowledge',
    'the context you now have, and then wait for the user\'s next message.',
    'Do not take any action yet.',
    '',
    '=== TRANSCRIPT ===',
    body,
    '=== END TRANSCRIPT ===',
  ].join('\n');
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './jobs.mjs';

export function latestSession(cwd) {
  const dir = join(stateDir(), 'sessions');
  if (!existsSync(dir)) return null;
  const sid = process.env.CLAUDE_SESSION_ID;
  if (sid && existsSync(join(dir, `${sid}.json`))) {
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
  let selected = turns.slice(-maxTurns);
  let total = selected.reduce((n, t) => n + t.text.length, 0);
  while (selected.length > 1 && total > maxBytes) {
    total -= selected[0].text.length;
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

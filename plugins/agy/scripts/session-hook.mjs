// SessionStart hook: record this session's transcript path for /agy:transfer.
// Must never block or fail session startup — always exit 0.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './lib/jobs.mjs';
import { isSafeSessionId } from './lib/transcript.mjs';

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw);
    // The id becomes a filename; an unsafe one is refused outright rather than
    // rewritten, so this writer and latestSession() always agree on the path.
    if (isSafeSessionId(payload.session_id) && payload.transcript_path) {
      const dir = join(stateDir(), 'sessions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${payload.session_id}.json`),
        JSON.stringify({
          sessionId: payload.session_id,
          transcriptPath: payload.transcript_path,
          cwd: payload.cwd || process.cwd(),
          updatedAt: new Date().toISOString(),
        }, null, 2),
      );
    }
  } catch { /* never block session start */ }
  process.exit(0);
});
process.stdin.on('error', () => process.exit(0));

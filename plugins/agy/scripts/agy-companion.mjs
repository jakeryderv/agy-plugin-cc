#!/usr/bin/env node
// agy-companion — the single entrypoint every /agy:* command invokes.
// Subcommands added in later tasks extend the dispatch table at the bottom.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, UsageError } from './lib/args.mjs';
import {
  findAgy, authStatus, agyVersion, listModels, validateModel, validateEffort,
  validateModelEffortCombo, buildAgyArgs,
} from './lib/agy.mjs';
import { startJob, listJobs, getJob, jobState, jobResult, cancelJob, stateDir, extractConversationId } from './lib/jobs.mjs';
import { latestSession, extractTurns, buildHandoffPrompt } from './lib/transcript.mjs';

const INSTALL_HINT =
  'agy is not installed. Install with: curl -fsSL https://antigravity.google/cli/install.sh | bash';

function requireAgy() {
  const bin = findAgy();
  if (!bin) {
    process.stderr.write(`${INSTALL_HINT}\n`);
    process.exit(127);
  }
  return bin;
}

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function taskFlags(flags, bin) {
  validateModelEffortCombo(flags.model, flags.effort);
  if (flags.model) validateModel(bin, flags.model);
  if (flags.effort) validateEffort(flags.effort);
  return {
    model: flags.model,
    effort: flags.effort,
    fullAccess: Boolean(flags['full-access']),
  };
}

function streamAgy(bin, agyArgs) {
  const r = spawnSync(bin, agyArgs, { stdio: 'inherit' });
  if (r.error) process.stderr.write(`${r.error.message}\n`);
  process.exit(r.status ?? 1);
}

function cmdSetup() {
  const bin = findAgy();
  if (!bin) {
    emit({
      ready: false,
      agy: { available: false, path: null, version: null },
      auth: { status: authStatus() },
      models: null,
      error: INSTALL_HINT,
    });
    return;
  }
  const authHint = authStatus();
  const models = listModels(bin);
  const authWorking = models !== null;
  const ready = authWorking;
  emit({
    ready,
    agy: { available: true, path: bin, version: agyVersion(bin) },
    auth: { status: authWorking && authHint === 'missing' ? 'keyring' : authHint, working: authWorking },
    models: models ? { count: models.length } : null,
    error: ready
      ? null
      : 'agy did not respond to `agy models` — check that it is authenticated (run `agy` once interactively, or set ANTIGRAVITY_API_KEY).',
  });
}

function cmdModels() {
  const bin = requireAgy();
  const r = spawnSync(bin, ['models'], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function cmdRun(argv) {
  const { flags, positional } = parseArgs(argv, {
    model: 'value',
    effort: 'value',
    'full-access': 'flag',
    continue: 'flag',
    conversation: 'value',
  });
  const prompt = positional.join(' ').trim();
  if (!prompt) throw new UsageError('run requires a prompt');
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  streamAgy(bin, buildAgyArgs({
    prompt,
    ...opts,
    continueLast: Boolean(flags.continue),
    conversation: flags.conversation,
  }));
}

const REVIEW_INTRO = `You are a senior engineer performing a read-only code review.
Review the diff below for correctness, edge cases, security issues, and
maintainability. Report findings as a prioritized list; each finding needs
file/line, a one-sentence problem statement, and a concrete failure scenario.
Say "no significant findings" if the diff is clean. Do not modify any files.`;

const ADVERSARIAL_INTRO = `You are an adversarial reviewer. Your job is to challenge this change:
question the design decisions, hunt for hidden assumptions, argue where a
simpler or safer approach exists, and probe edge cases the author likely
missed. Be specific and technical, not contrarian for its own sake. Findings
need file/line and a concrete scenario. Do not modify any files.`;

function cmdReview(argv) {
  const { flags, positional } = parseArgs(argv, {
    adversarial: 'flag',
    model: 'value',
    effort: 'value',
  });
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  let diff = spawnSync('git', ['diff', 'HEAD'], { encoding: 'utf8' }).stdout || '';
  if (!diff.trim()) {
    diff = spawnSync('git', ['diff'], { encoding: 'utf8' }).stdout || '';
  }
  if (!diff.trim()) {
    process.stderr.write('no changes to review (git diff HEAD and git diff are both empty)\n');
    process.exit(1);
  }
  const intro = flags.adversarial ? ADVERSARIAL_INTRO : REVIEW_INTRO;
  const focus = positional.join(' ').trim();
  const prompt = [
    intro,
    focus ? `\nReviewer focus: ${focus}` : '',
    '\nDiff:\n```diff\n' + diff + '\n```',
  ].join('\n');
  streamAgy(bin, buildAgyArgs({ prompt, ...opts, fullAccess: false }));
}

function cmdJobStart(argv) {
  const { flags, positional } = parseArgs(argv, {
    model: 'value',
    effort: 'value',
    'full-access': 'flag',
  });
  const task = positional.join(' ').trim();
  if (!task) throw new UsageError('job-start requires a task');
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  const meta = startJob(bin, task, opts);
  emit({ jobId: meta.id, state: 'running', task: meta.task });
}

const jobSummary = (meta) => ({
  id: meta.id,
  state: meta.state ?? jobState(meta),
  task: meta.task,
  model: meta.model,
  createdAt: meta.createdAt,
});

function cmdJobStatus(argv) {
  const { positional } = parseArgs(argv, {});
  if (positional[0]) {
    emit(jobSummary(getJob(positional[0])));
  } else {
    emit({ jobs: listJobs().map(jobSummary) });
  }
}

function cmdJobResult(argv) {
  const { positional } = parseArgs(argv, {});
  if (!positional[0]) throw new UsageError('job-result requires a job id');
  emit(jobResult(positional[0]));
}

async function cmdJobCancel(argv) {
  const { positional } = parseArgs(argv, {});
  if (!positional[0]) throw new UsageError('job-cancel requires a job id');
  emit(await cancelJob(positional[0]));
}

function cmdTransfer(argv) {
  const { flags } = parseArgs(argv, { model: 'value', effort: 'value' });
  const bin = requireAgy();
  const opts = taskFlags(flags, bin);
  const session = latestSession(process.cwd());
  if (!session || !existsSync(session.transcriptPath)) {
    process.stderr.write(
      'no Claude session transcript is known yet. The SessionStart hook records it; start a fresh session (or /reload-plugins) and try again.\n',
    );
    process.exit(1);
  }
  const turns = extractTurns(session.transcriptPath, {});
  if (!turns.length) {
    process.stderr.write('the session transcript has no text turns to transfer.\n');
    process.exit(1);
  }
  const prompt = buildHandoffPrompt(turns, session.cwd);
  const logDir = join(stateDir(), 'transfer');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `transfer-${Date.now()}.log`);
  const r = spawnSync(bin, buildAgyArgs({
    prompt, ...opts, fullAccess: false, logFile,
  }), { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.error?.message || `agy exited ${r.status}\n`);
    process.exit(r.status ?? 1);
  }
  const conversationId = existsSync(logFile)
    ? extractConversationId(readFileSync(logFile, 'utf8'))
    : null;
  emit({ conversationId, turns: turns.length, response: (r.stdout || '').trim() });
}

const COMMANDS = {
  setup: () => cmdSetup(),
  models: () => cmdModels(),
  run: (argv) => cmdRun(argv),
  review: (argv) => cmdReview(argv),
  'job-start': (argv) => cmdJobStart(argv),
  'job-status': (argv) => cmdJobStatus(argv),
  'job-result': (argv) => cmdJobResult(argv),
  'job-cancel': (argv) => cmdJobCancel(argv),
  transfer: (argv) => cmdTransfer(argv),
};

const [subcommand, ...rest] = process.argv.slice(2);
try {
  const handler = COMMANDS[subcommand];
  if (!handler) {
    throw new UsageError(
      `unknown subcommand "${subcommand ?? ''}". Known: ${Object.keys(COMMANDS).join(', ')}`,
    );
  }
  await handler(rest); // top-level await: handlers may be async (job-cancel)
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(64);
  }
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
}

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

// onTooLarge, when given, handles the case where the prompt exceeds what the
// platform accepts as a single argv element. Detected from the failed spawn
// rather than predicted: the per-argument cap is a Linux constant that macOS
// does not share, so a hardcoded threshold would refuse work macOS can do.
// execve rejects before the binary starts, so this costs nothing.
function streamAgy(bin, agyArgs, onTooLarge) {
  const r = spawnSync(bin, agyArgs, { stdio: 'inherit' });
  if (r.error?.code === 'E2BIG' && onTooLarge) onTooLarge();
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

const kb = (n) => `${Math.round(n / 1024)} KB`;

// Per-path diff sizes, largest first. Used only to explain an oversized diff,
// so a path that fails to measure is simply omitted rather than fatal.
// revArgs is the revision part (`diff HEAD` or `diff`); pathArgs is the
// pathspec part, kept separate because `--name-only` must precede `--`.
function diffSizesByPath(revArgs, pathArgs) {
  const listed = spawnSync('git', [...revArgs, '--name-only', ...pathArgs], { encoding: 'utf8' }).stdout || '';
  const paths = listed.split('\n').map((p) => p.trim()).filter(Boolean);
  const sized = [];
  for (const path of paths) {
    const out = spawnSync('git', [...revArgs, '--', path], { encoding: 'utf8' }).stdout;
    if (typeof out === 'string') sized.push({ path, bytes: Buffer.byteLength(out, 'utf8') });
  }
  return sized.sort((a, b) => b.bytes - a.bytes);
}

// agy accepts a prompt only as argv, so a diff past the platform's
// per-argument limit cannot be delivered at all. Report what is there and what
// would fit; never review part of it, since a partial review that finds
// nothing reads as a clean bill of health.
function reportOversizedDiff(diff, revArgs, pathArgs, overheadBytes) {
  const total = Buffer.byteLength(diff, 'utf8');
  const files = diffSizesByPath(revArgs, pathArgs);
  const lines = [
    `diff is ${kb(total)} — too large to pass to agy in one call.`,
    '',
  ];
  for (const f of files) lines.push(`  ${kb(f.bytes).padStart(8)}  ${f.path}`);

  // Fit smallest-first against a budget derived from what actually failed, so
  // the suggestion stays honest without hardcoding a platform constant.
  const budget = Math.max(0, total - overheadBytes);
  const fits = [];
  let used = 0;
  for (const f of [...files].reverse()) {
    if (used + f.bytes > budget) break;
    used += f.bytes;
    fits.push(f.path);
  }
  if (fits.length && fits.length < files.length) {
    lines.push('', `these fit:  /agy:review -- ${fits.join(' ')}`);
  } else {
    lines.push('', 'narrow the scope with:  /agy:review -- <paths>');
  }
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exit(1);
}

function cmdReview(argv) {
  // `--` separates reviewer focus from path scoping, matching git's own
  // convention: `/agy:review some focus` steers attention, `/agy:review -- src`
  // limits which paths are diffed. Split before parseArgs, which would
  // otherwise fold the paths into the focus text.
  const sep = argv.indexOf('--');
  const paths = sep === -1 ? [] : argv.slice(sep + 1);
  const { flags, positional } = parseArgs(sep === -1 ? argv : argv.slice(0, sep), {
    adversarial: 'flag',
    model: 'value',
    effort: 'value',
  });
  const pathArgs = paths.length ? ['--', ...paths] : [];
  const bin = requireAgy();
  // Local, free flag validation stays here so a malformed command fails at
  // once; the model check needs a live `agy models` call and waits until the
  // local preconditions below have had their say.
  validateModelEffortCombo(flags.model, flags.effort);
  if (flags.effort) validateEffort(flags.effort);

  const inWorkTree = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if ((inWorkTree.stdout || '').trim() !== 'true') {
    process.stderr.write('not inside a git repository — review works on a git working-tree diff.\n');
    process.exit(1);
  }

  let revArgs = ['diff', 'HEAD'];
  let diff = spawnSync('git', [...revArgs, ...pathArgs], { encoding: 'utf8' }).stdout || '';
  if (!diff.trim()) {
    revArgs = ['diff'];
    diff = spawnSync('git', [...revArgs, ...pathArgs], { encoding: 'utf8' }).stdout || '';
  }
  if (!diff.trim()) {
    process.stderr.write(paths.length
      ? `no changes to review under ${paths.join(' ')}.\n`
      : 'no changes to review — the working tree matches HEAD.\n');
    process.exit(1);
  }

  if (flags.model) validateModel(bin, flags.model);

  const intro = flags.adversarial ? ADVERSARIAL_INTRO : REVIEW_INTRO;
  const focus = positional.join(' ').trim();
  const prompt = [
    intro,
    focus ? `\nReviewer focus: ${focus}` : '',
    '\nDiff:\n```diff\n' + diff + '\n```',
  ].join('\n');

  const overhead = Buffer.byteLength(prompt, 'utf8') - Buffer.byteLength(diff, 'utf8');
  streamAgy(bin, buildAgyArgs({
    prompt,
    ...taskFlags(flags, bin),
    fullAccess: false,
  }), () => reportOversizedDiff(diff, revArgs, pathArgs, overhead));
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

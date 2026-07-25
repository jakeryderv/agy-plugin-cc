import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { UsageError } from './args.mjs';

const FALLBACKS = () => [
  join(homedir(), '.local', 'bin', 'agy'),
  '/usr/local/bin/agy',
  '/opt/antigravity/bin/agy',
];

export function findAgy() {
  if (process.env.AGY_BIN) {
    return existsSync(process.env.AGY_BIN) ? process.env.AGY_BIN : null;
  }
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, 'agy');
    if (existsSync(p)) return p;
  }
  for (const p of FALLBACKS()) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function authStatus() {
  if (process.env.ANTIGRAVITY_API_KEY) return 'api-key';
  if (
    existsSync(join(homedir(), '.config', 'antigravity')) ||
    existsSync(join(homedir(), '.gemini', 'antigravity-cli'))
  ) return 'oauth';
  return 'missing';
}

export function agyVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.trim().split('\n')[0];
}

export function listModels(bin) {
  const r = spawnSync(bin, ['models'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function validateModel(bin, model) {
  const models = listModels(bin);
  if (models && !models.includes(model)) {
    throw new UsageError(
      `unknown model "${model}". Available models:\n  ${models.join('\n  ')}`,
    );
  }
}

export function validateEffort(effort) {
  if (!['low', 'medium', 'high'].includes(effort)) {
    throw new UsageError(`--effort must be low, medium, or high (got "${effort}")`);
  }
}

// agy accepts no --model/--effort pairing: models that support tiering encode
// it in the name (gemini-3.6-flash-low) and conflict with --effort, and the
// ones that don't (claude-sonnet-4-6) reject the flag outright. Caught here so
// no live call is spent learning that. A blanket rule rather than a per-model
// one on purpose — parsing tier suffixes would bake agy's naming scheme into
// the plugin and would still be wrong for the untiered models.
export function validateModelEffortCombo(model, effort) {
  if (model && effort) {
    throw new UsageError(
      `--model and --effort cannot be used together (got --model "${model}" --effort "${effort}").\n`
      + '  agy carries the effort tier in the model name, so pick one:\n'
      + `  --model <name> with the tier you want (e.g. a "-${effort}" variant, see \`agy models\`), or\n`
      + `  --effort ${effort} on its own to set the tier for the default model.`,
    );
  }
}

export function buildAgyArgs(opts) {
  const args = ['-p', opts.prompt];
  if (opts.model) args.push('--model', opts.model);
  if (opts.effort) args.push('--effort', opts.effort);
  // Total choice, deliberately: full access or sandbox, never neither. These
  // are all headless (-p) runs, where agy cannot prompt for permission, so an
  // invocation carrying no access flag is an unsandboxed one. There is no
  // `sandbox` option to omit — the only way out of the sandbox is fullAccess,
  // which only ever comes from the user.
  if (opts.fullAccess) args.push('--dangerously-skip-permissions');
  else args.push('--sandbox');
  if (opts.continueLast) args.push('--continue');
  if (opts.conversation) args.push('--conversation', opts.conversation);
  if (opts.logFile) args.push('--log-file', opts.logFile);
  args.push('--print-timeout', opts.printTimeout || '10m');
  return args;
}

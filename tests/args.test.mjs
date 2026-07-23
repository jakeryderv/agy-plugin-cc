import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, UsageError } from '../plugins/agy/scripts/lib/args.mjs';

const SPEC = { model: 'value', effort: 'value', background: 'flag', 'full-access': 'flag' };

test('parses value flags, boolean flags, and positionals', () => {
  const r = parseArgs(['--model', 'pro', '--background', 'do', 'the', 'thing'], SPEC);
  assert.deepEqual(r.flags, { model: 'pro', background: true });
  assert.deepEqual(r.positional, ['do', 'the', 'thing']);
});

test('parses --flag=value form', () => {
  const r = parseArgs(['--effort=high', 'task'], SPEC);
  assert.equal(r.flags.effort, 'high');
});

test('double dash ends flag parsing', () => {
  const r = parseArgs(['--model', 'pro', '--', '--not-a-flag'], SPEC);
  assert.deepEqual(r.positional, ['--not-a-flag']);
});

test('unknown flag throws UsageError', () => {
  assert.throws(() => parseArgs(['--bogus'], SPEC), UsageError);
});

test('missing value throws UsageError', () => {
  assert.throws(() => parseArgs(['--model'], SPEC), UsageError);
  assert.throws(() => parseArgs(['--model='], SPEC), UsageError);
});

test('value passed to boolean flag throws UsageError', () => {
  assert.throws(() => parseArgs(['--background=yes'], SPEC), UsageError);
});

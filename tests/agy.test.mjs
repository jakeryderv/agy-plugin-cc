import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  findAgy, agyVersion, listModels, validateModel, validateEffort, buildAgyArgs,
} from '../plugins/agy/scripts/lib/agy.mjs';
import { UsageError } from '../plugins/agy/scripts/lib/args.mjs';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fake-agy');
process.env.AGY_BIN = FAKE;

test('findAgy honors AGY_BIN override', () => {
  assert.equal(findAgy(), FAKE);
});

test('agyVersion returns first line', () => {
  assert.equal(agyVersion(FAKE), 'agy version 9.9.9-fake');
});

test('listModels parses live output', () => {
  assert.deepEqual(listModels(FAKE), ['fake-flash', 'fake-pro', 'fake-opus']);
});

test('validateModel accepts a listed model and rejects others', () => {
  validateModel(FAKE, 'fake-pro');
  assert.throws(() => validateModel(FAKE, 'gpt-99'), UsageError);
  assert.throws(() => validateModel(FAKE, 'gpt-99'), /fake-flash/);
});

test('validateEffort accepts low|medium|high only', () => {
  validateEffort('low');
  validateEffort('high');
  assert.throws(() => validateEffort('max'), UsageError);
});

test('buildAgyArgs: sandbox default vs full access', () => {
  const s = buildAgyArgs({ prompt: 'hi', sandbox: true });
  assert.ok(s.includes('--sandbox'));
  const f = buildAgyArgs({ prompt: 'hi', sandbox: true, fullAccess: true });
  assert.ok(f.includes('--dangerously-skip-permissions'));
  assert.ok(!f.includes('--sandbox'));
});

test('buildAgyArgs: passthrough flags and default timeout', () => {
  const a = buildAgyArgs({
    prompt: 'hi', model: 'fake-pro', effort: 'high',
    conversation: 'conv-1', logFile: '/tmp/x.log',
  });
  assert.deepEqual(a.slice(0, 2), ['-p', 'hi']);
  assert.ok(a.includes('--model') && a.includes('fake-pro'));
  assert.ok(a.includes('--effort') && a.includes('high'));
  assert.ok(a.includes('--conversation') && a.includes('conv-1'));
  assert.ok(a.includes('--log-file') && a.includes('/tmp/x.log'));
  assert.ok(a.includes('--print-timeout') && a.includes('10m'));
});

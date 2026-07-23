export class UsageError extends Error {}

export function parseArgs(argv, spec) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const kind = spec[name];
      if (!kind) throw new UsageError(`unknown flag --${name}`);
      if (kind === 'flag') {
        if (eq !== -1) throw new UsageError(`--${name} takes no value`);
        flags[name] = true;
        i += 1;
      } else {
        let value;
        if (eq !== -1) {
          value = arg.slice(eq + 1);
          i += 1;
        } else {
          value = argv[i + 1];
          i += 2;
        }
        if (value === undefined || value === '') {
          throw new UsageError(`--${name} requires a value`);
        }
        flags[name] = value;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { flags, positional };
}

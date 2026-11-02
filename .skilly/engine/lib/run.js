import { spawnSync } from 'node:child_process';

// Shared process helpers for the skilly scripts. The Engine never prompts.
export function run(cmd, args, { cwd, input, env } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    input,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : undefined,
  });
  if (result.error) throw new Error(`failed to run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout.trim();
}

// Like run, but returns null on failure instead of throwing.
export function tryRun(cmd, args, options = {}) {
  try {
    return run(cmd, args, options);
  } catch {
    return null;
  }
}

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tryRun } from './run.js';
import { readLock } from './skills-cli.js';

// The consumer's own "owner/repo", read from the git remote. The directory
// name is never the identity, so a worktree or a renamed clone behaves the
// same. null when there is no git, no remote, or a non-GitHub remote: bundle
// resolution then keeps every source, exactly as before Self-source existed.
export function selfSource(cwd) {
  const url = tryRun('git', ['-C', cwd, 'remote', 'get-url', 'origin']);
  if (!url) return null;
  const match = url.match(
    /^(?:https?:\/\/(?:[^@/\s]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

// Skills the consumer writes itself: a folder in .agents/skills without a pin.
// A pinned folder was installed, so it is no reason to skip the skill.
export function ownSkills(cwd) {
  const dir = join(cwd, '.agents', 'skills');
  if (!existsSync(dir)) return new Set();
  const lock = readLock(cwd);
  return new Set(
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !(entry.name in lock))
      .map((entry) => entry.name),
  );
}

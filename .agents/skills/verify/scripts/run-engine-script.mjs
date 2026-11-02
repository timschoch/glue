// Each script in this folder runs its Engine copy through this helper, for a
// Consumer's own ci.yml or .skilly/verify.json that still calls this path. The
// Engine's verify.json and the hook entries call .skilly/engine/ directly.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A Consumer holds the Engine in .skilly/engine/, the Hub in engine/.
const ENGINE_DIRS = [join('.skilly', 'engine'), 'engine'];

// The nearest ancestor of `from` that holds `script` in an Engine folder.
export function findEngineScript(script, from) {
  for (let directory = from; ; directory = dirname(directory)) {
    for (const engine of ENGINE_DIRS) {
      const path = join(directory, engine, script);
      if (existsSync(path)) return path;
    }
    if (dirname(directory) === directory) return null;
  }
}

// Runs `script`, a path inside the Engine, with `args`, this process's stdin and its exit code.
export function runEngineScript(script, shimUrl, args = process.argv.slice(2)) {
  const path = findEngineScript(script, dirname(fileURLToPath(shimUrl)));
  if (!path) {
    console.error(`skilly: no .skilly/engine/${script} above this skill. The next skilly sync writes it.`);
    process.exit(1);
  }
  const command = path.endsWith('.sh') ? 'bash' : process.execPath;
  const result = spawnSync(command, [path, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

// The shell shims call it as a script: node run-engine-script.mjs <script> [args...]
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runEngineScript(process.argv[2], import.meta.url, process.argv.slice(3));
}

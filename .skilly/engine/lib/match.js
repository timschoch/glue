import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Match one name against the hub's bundles, first match wins: a bundle beats
// a skill of the same name. Returns null for
// names the hub does not know.
export function matchName(name, bundlesDir) {
  if (existsSync(join(bundlesDir, name, 'config.json'))) return { type: 'bundle', name };

  const bundles = readdirSync(bundlesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const bundle of bundles) {
    const configPath = join(bundlesDir, bundle, 'config.json');
    if (!existsSync(configPath)) continue;
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    for (const entry of config.sources ?? []) {
      if ((entry.skills ?? []).includes(name)) return { type: 'skill', name, source: entry.source };
    }
  }
  return null;
}

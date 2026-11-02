import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// Skilly-owned files are not the consumer's code — keep its formatter off
// them, or every Sync PR fails the consumer's own CI (design record, #17).
// Runs on setup, add, and update: a formatter added after setup gets patched
// by the next skilly verb, and the nightly update heals every consumer.
const SKILLY_FILES = ['skills-lock.json'];
const SKILLY_DIRS = ['.skilly', '.claude/rules', '.claude/skills', '.agents'];

// Biome 2.2 warns on a folder written as `dir/**` (useBiomeIgnoreFolder) and
// crawls the folder anyway, Biome 1.x reads only the glob, and .prettierignore
// takes a folder the way .gitignore does. Consumers set up before this split
// carry the other form, so skilly swaps the form it wrote in place — appending
// the right one would leave the warning behind.
const same = (path) => path;
const glob = (dir) => `${dir}/**`;
const negated = (path) => `!${path}`;
const folderForms = (major) => (major >= 2 ? { want: same, stale: glob } : { want: glob, stale: same });

const skillyEntries = (forms, decorate = same) =>
  new Set([...SKILLY_FILES, ...SKILLY_DIRS.map(forms.want), ...SKILLY_DIRS.map(forms.stale)].map(decorate));

// Rewrite skilly's stale folder form to the wanted one, keeping its position.
// Entries skilly does not own are passed through untouched.
function migrate(entries, forms, decorate = same) {
  const swap = new Map(SKILLY_DIRS.map((dir) => [decorate(forms.stale(dir)), decorate(forms.want(dir))]));
  const owned = skillyEntries(forms, decorate);
  const out = [];
  for (const entry of entries) {
    const swapped = swap.get(entry) ?? entry;
    if (owned.has(swapped) && out.includes(swapped)) continue; // both forms were present
    out.push(swapped);
  }
  return out;
}

const missingFrom = (entries, forms, decorate = same) =>
  [...SKILLY_FILES, ...SKILLY_DIRS.map(forms.want)].map(decorate).filter((path) => !entries.includes(path));

// The config shape does not say which Biome runs: a 2.x config that never
// declared files.includes looks exactly like a 1.x one, and skilly used to
// write the 1.x key into it. Ask the manifest first, then the $schema URL,
// and fall back to the shape only when neither names a version.
export function biomeMajor(cwd, config = {}) {
  const manifestPath = join(cwd, 'package.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const range = { ...manifest.dependencies, ...manifest.devDependencies }['@biomejs/biome'] ?? '';
  const declared = /(\d+)\./.exec(range) ?? /biomejs\.dev\/schemas\/(\d+)\./.exec(config.$schema ?? '');
  if (declared) return Number(declared[1]);
  return Array.isArray(config.files?.ignore) && !Array.isArray(config.files?.includes) ? 1 : 2;
}

export function addFormatterIgnores(cwd) {
  const biomePath = ['biome.json', 'biome.jsonc'].map((file) => join(cwd, file)).find(existsSync);
  if (biomePath) {
    if (biomePath.endsWith('.jsonc')) {
      const forms = folderForms(biomeMajor(cwd));
      const wanted = [...SKILLY_FILES, ...SKILLY_DIRS.map(forms.want)];
      console.log(`biome.jsonc found — add these to its ignore list yourself: ${wanted.join(', ')}`);
    } else {
      const config = JSON.parse(readFileSync(biomePath, 'utf8'));
      const major = biomeMajor(cwd, config);
      const forms = folderForms(major);
      config.files ??= {};
      if (major >= 2) {
        // Biome 2.x: negated patterns in files.includes, which defaults to `**`
        const kept = migrate(config.files.includes ?? ['**'], forms, negated);
        config.files.includes = [...kept, ...missingFrom(kept, forms, negated)];
        // An older skilly read this config as 1.x and wrote files.ignore, a key
        // Biome 2 does not know. Drop it once nothing but skilly's own is left.
        const owned = skillyEntries(folderForms(1));
        if (config.files.ignore?.every((entry) => owned.has(entry))) delete config.files.ignore;
      } else {
        const kept = migrate(config.files.ignore ?? [], forms);
        config.files.ignore = [...kept, ...missingFrom(kept, forms)];
      }
      writeFileSync(biomePath, JSON.stringify(config, null, 2) + '\n');
      console.log('added skilly-owned files to the biome ignore list');
    }
  }
  // Always ensure .prettierignore, even before any Prettier config exists:
  // Prettier can arrive later and would otherwise reformat
  // vendor skills and invalidate every computedHash in skills-lock.json.
  const prettierIgnore = join(cwd, '.prettierignore');
  const forms = folderForms(2); // .gitignore syntax: a bare folder covers its contents
  const lines = existsSync(prettierIgnore) ? readFileSync(prettierIgnore, 'utf8').split('\n') : [];
  const kept = migrate(lines, forms);
  if (kept.join('\n') !== lines.join('\n')) {
    writeFileSync(prettierIgnore, kept.join('\n'));
    console.log('rewrote skilly-owned folders in .prettierignore');
  }
  const missing = missingFrom(kept, forms);
  if (missing.length) {
    appendFileSync(prettierIgnore, `${kept.length ? '\n' : ''}# skilly-owned files\n${missing.join('\n')}\n`);
    console.log('added skilly-owned files to .prettierignore');
  }
}

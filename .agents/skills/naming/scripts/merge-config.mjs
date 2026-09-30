// Deep merge of one override onto one base config: skill defaults, then the
// consumer's `.skilly/<skill>.json`. The naming and verify skills each ship a
// byte-identical copy, because a skill must work without the other one. The
// hub's `scripts/validate-shared-copies.mjs` fails a push when the copies differ.
//
// Merge rules:
// - Objects merge by key. `null` drops a key. `$comment` keys disappear.
// - Scalars are replaced.
// - Arrays append. A string entry dedupes; an object with a `name` merges into
//   the base entry of that name. Other objects append unchanged.
// - A `-x` string in an override array drops the string `x`, or the entry
//   named `x`.
const COMMENT_KEY = '$comment';

export const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isNamed = (entry) => isPlainObject(entry) && typeof entry.name === 'string';

// Drops every `$comment` key, at any depth, from a value taken as-is.
function removeComments(value) {
  if (Array.isArray(value)) return value.map(removeComments);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== COMMENT_KEY) result[key] = removeComments(entry);
  }
  return result;
}

function mergeArrays(baseEntries, overrideEntries) {
  const removals = new Set();
  const additions = [];
  for (const entry of overrideEntries) {
    if (typeof entry === 'string' && entry.startsWith('-')) removals.add(entry.slice(1));
    else additions.push(entry);
  }
  const result = [];
  for (const entry of [...baseEntries, ...additions]) {
    if (typeof entry === 'string') {
      if (!removals.has(entry) && !result.includes(entry)) result.push(entry);
      continue;
    }
    if (!isNamed(entry)) {
      result.push(removeComments(entry));
      continue;
    }
    if (removals.has(entry.name)) continue;
    const index = result.findIndex((known) => isNamed(known) && known.name === entry.name);
    if (index === -1) result.push(removeComments(entry));
    else result[index] = mergeConfig(result[index], entry);
  }
  return result;
}

function mergeValues(baseValue, overrideValue) {
  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) return mergeConfig(baseValue, overrideValue);
  if (Array.isArray(baseValue) && Array.isArray(overrideValue)) return mergeArrays(baseValue, overrideValue);
  return removeComments(overrideValue);
}

export function mergeConfig(base, override) {
  const result = removeComments(base ?? {});
  for (const [key, value] of Object.entries(override ?? {})) {
    if (key === COMMENT_KEY) continue;
    if (value === null) {
      delete result[key];
      continue;
    }
    result[key] = mergeValues(result[key], value);
  }
  return result;
}

// A `$identify` event: posthog-js sends it under the identified distinct id,
// with the anonymous id it used before in `$anon_distinct_id`.
export type IdentifyEvent = {
  distinctId: string
  properties: Record<string, unknown>
}

// Maps each merged distinct id to its person's id, like PostHog merges the
// anonymous person into the identified one. The person's id is the id the
// chain of identifies ends at. An id missing from the map is its own person.
export function toPersonIds(identifies: IdentifyEvent[]): Map<string, string> {
  const parents = new Map<string, string>()
  const getRoot = (distinctId: string) => {
    let root = distinctId
    for (
      let parent = parents.get(root);
      parent !== undefined;
      parent = parents.get(root)
    ) {
      root = parent
    }
    return root
  }

  for (const { distinctId, properties } of identifies) {
    const anonymousId = properties.$anon_distinct_id
    if (typeof anonymousId !== 'string' && typeof anonymousId !== 'number') {
      continue
    }
    const anonymousRoot = getRoot(String(anonymousId))
    const identifiedRoot = getRoot(distinctId)
    if (anonymousRoot !== identifiedRoot) {
      parents.set(anonymousRoot, identifiedRoot)
    }
  }

  return new Map(
    [...parents.keys()].map((distinctId) => [distinctId, getRoot(distinctId)]),
  )
}

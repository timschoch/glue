// A `$identify` event's distinct id and the anonymous id it carries in
// `$anon_distinct_id`, posthog-js sends it under the identified distinct id.
export type Identify = {
  distinctId: string
  anonymousId: string
}

// Maps each merged distinct id to its person's id, like PostHog merges the
// anonymous person into the identified one. The person's id is the id the
// chain of identifies ends at. An id missing from the map is its own person.
//
// Real PostHog does not merge two already-identified persons this way: it
// only merges a truly anonymous id into an identified one. This mock does
// not track that distinction, so it merges a whole chain of identifies
// transitively, even across already-identified ids.
export function toPersonIds(identifies: Identify[]): Map<string, string> {
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

  for (const { distinctId, anonymousId } of identifies) {
    const anonymousRoot = getRoot(anonymousId)
    const identifiedRoot = getRoot(distinctId)
    if (anonymousRoot !== identifiedRoot) {
      parents.set(anonymousRoot, identifiedRoot)
    }
  }

  return new Map(
    [...parents.keys()].map((distinctId) => [distinctId, getRoot(distinctId)]),
  )
}

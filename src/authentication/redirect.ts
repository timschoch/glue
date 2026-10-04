// The pages that can be a target: the start of a Project, a Concept and a
// record.
const targetPattern = /^\/([\w-]+)(?:\/([\w-]+)(?:\/([A-Z]\d+))?)?$/

// The page to show after sign-in. Only a path of Glue itself is a target,
// so a link to sign-in can never send a person to another site.
export function parseRedirect(input: unknown): string | undefined {
  return typeof input === 'string' && targetPattern.test(input)
    ? input
    : undefined
}

// Without a target, the start.
export function toDestination(target: string | undefined) {
  const found = targetPattern.exec(target ?? '')
  if (!found) return { to: '/' } as const
  const [, project, concept, recordId] = found as Array<string | undefined>
  if (project && concept && recordId) {
    return {
      to: '/$project/$concept/$recordId',
      params: { project, concept, recordId },
    } as const
  }
  if (project && concept) {
    return { to: '/$project/$concept', params: { project, concept } } as const
  }
  return { to: '/$project', params: { project: project ?? '' } } as const
}

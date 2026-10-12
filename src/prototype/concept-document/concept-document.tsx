import { getRouteApi, useRouter } from '@tanstack/react-router'

import type { ProjectBuilds } from '../../db/builds.ts'
import type { Concept } from '../../db/parts.ts'
import type { Variant } from '../../project/project-search.ts'
import { toConceptDocument } from './document.ts'
import { Shell, VariantSwitcher } from './shell.tsx'
import { VariantA } from './variant-a.tsx'
import { VariantB } from './variant-b.tsx'
import { VariantC } from './variant-c.tsx'

// PROTOTYPE, throwaway (design-system/D16). A Concept as one document, in
// three variants: `?variant=A|B|C` on the route of the Concept.

const projectRoute = getRouteApi('/_signed-in/$project')

const variantScreens = { A: VariantA, B: VariantB, C: VariantC }

export function ConceptDocument({
  concept,
  builds,
}: {
  concept: Concept
  builds?: ProjectBuilds
}) {
  const router = useRouter()
  const { project, measured } = projectRoute.useLoaderData()
  const { variant = 'A' } = projectRoute.useSearch()
  const conceptHref = (slug: string, other: Variant = variant) =>
    router.buildLocation({
      to: '/$project/$concept',
      params: { project: project.slug, concept: slug },
      search: { variant: other },
    }).href
  const Screen = variantScreens[variant]

  return (
    <Shell
      project={project.name}
      concept={concept.title}
      concepts={project.concept.concepts.map((node) => ({
        name: node.title,
        href: conceptHref(node.slug),
        current: node.slug === concept.slug,
      }))}
    >
      <Screen document={toConceptDocument(concept, builds, measured)} />
      <VariantSwitcher
        current={variant}
        variantHref={(other) => conceptHref(concept.slug, other)}
      />
    </Shell>
  )
}

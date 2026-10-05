import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import type { ProjectBuilds } from '../db/builds.ts'
import type { Concept, PartSummary } from '../db/parts.ts'
import type { ContractState } from '../db/contracts.ts'
import type { ProjectSignals, Signal } from '../db/signals.ts'
import { ConceptView } from '../design-system/concept-view.tsx'
import { PartCards } from '../design-system/part-cards.tsx'
import { flagReasons } from '../design-system/record.tsx'
import { Signals } from '../design-system/signals.tsx'
import { AssigneesControl } from './assignees-control.tsx'
import { ContractSection } from './contract-screen.tsx'
import { LinkedBuilds } from './linked-builds.tsx'
import { NameFormScreen } from './name-form-screen.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { toReading } from './part-views.ts'
import { PeopleScreen } from './people-screen.tsx'
import { UNKNOWN_CONCEPT, isPartType, lensTypes } from './project-search.ts'
import { SignalInsightScreen } from './signal-insight-screen.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// One Concept in the main window, with the lens of the section. The section
// Understand shows the Signals of the Project too, and the section Build its
// builds. The form that the address
// names takes the place of the Concept. So does the form of the Insight that
// grows from the picked Signals. The section Mine shows the Parts of the
// whole Project that need the owner, and the Parts that the person watches. The section Use shows its Metrics and
// its measured Goals, each with its newest value against its target. The
// section People shows the members of the Project in place of a Concept.
export function ConceptScreen({
  concept,
  contract,
  signals,
  builds,
}: {
  concept: Concept
  contract: ContractState
  signals?: ProjectSignals
  // In the section Build: the builds of the Project. With no section: the
  // builds that name the Contract of the Concept.
  builds?: ProjectBuilds
}) {
  const router = useRouter()
  const { parts, mine, watched, measured } = projectRoute.useLoaderData()
  const { removeConcept } = projectRoute.useRouteContext()
  const { project, search, conceptHref, recordHref, open, changeSearch } =
    useProjectLinks()
  const { failure, write } = useWrite()
  const [picked, setPicked] = useState<ReadonlyArray<Signal>>()

  if (isPartType(search.add)) {
    // The key gives each Part type its own form with its own values.
    return <PartFormScreen key={search.add} type={search.add} parts={parts} />
  }
  if (search.add) return <NameFormScreen key={search.add} added={search.add} />
  if (picked) {
    return (
      <SignalInsightScreen
        signals={picked}
        parts={parts}
        onClose={() => setPicked(undefined)}
      />
    )
  }
  if (search.section === 'People') return <PeopleScreen />

  const listed = signals?.signals.map((signal) => ({
    ...signal,
    insight: signal.insight && {
      ...signal.insight,
      href: recordHref({
        id: signal.insight.id,
        concept:
          parts.find(({ id }) => id === signal.insight?.id)?.concept ??
          UNKNOWN_CONCEPT,
      }),
    },
  }))

  const toCard = (part: PartSummary) => ({
    id: part.id,
    type: part.type,
    title: part.title,
    trust: part.trust,
    workState: part.workState,
    concept: part.conceptTitle,
    href: recordHref(part),
  })

  if (search.section === 'Mine') {
    return (
      <PartCards
        title="Mine"
        parts={mine.map(toCard)}
        // A flag of a watched Part is a note: only the owner answers it.
        watched={watched.map((part) => ({
          ...toCard(part),
          note:
            part.flags
              .map(
                ({ reason, cause }) =>
                  `${flagReasons[reason]}: ${cause.id} ${cause.title}`,
              )
              .join('\n') || undefined,
        }))}
        onOpen={({ href }, event) => open(href, event)}
      />
    )
  }
  if (search.section === 'Use') {
    return (
      <PartCards
        title="Use"
        parts={measured.map((part) => ({
          ...toCard(part),
          reading: toReading(part.measure),
        }))}
        onOpen={({ href }, event) => open(href, event)}
      />
    )
  }

  // A Concept with no Part and no Version has nothing to sign. The Contract
  // is of the whole Concept: a lens shows a part of it, so no Contract.
  const hasContract =
    search.section === undefined &&
    (contract.versions.length > 0 ||
      concept.parts.length > 0 ||
      concept.concepts.length > 0)

  // The root stays. A Concept goes only when it holds nothing: no Part, no
  // Concept and no Contract Version.
  const isRemovable =
    concept.slug !== project &&
    concept.parts.length === 0 &&
    concept.concepts.length === 0 &&
    contract.versions.length === 0
  // After the removal the screen shows the parent Concept.
  const parent = concept.path.at(-1)?.slug ?? project

  return (
    <ConceptView
      concept={concept}
      view={search.view ?? 'list'}
      onViewChange={(view) =>
        void changeSearch({
          ...search,
          view: view === 'map' ? view : undefined,
        })
      }
      types={lensTypes(search.section)}
      partHref={recordHref}
      conceptHref={({ slug }) => conceptHref(slug)}
      onOpenPart={(part, event) => open(recordHref(part), event)}
      onOpenConcept={({ slug }, event) => open(conceptHref(slug), event)}
      onAddPart={(type) => void changeSearch({ ...search, add: type })}
      onAddConcept={() => void changeSearch({ ...search, add: 'concept' })}
      onRemove={
        isRemovable
          ? () =>
              void write(
                'Removing',
                () => removeConcept({ project, concept: concept.slug }),
                () => router.navigate({ href: conceptHref(parent) }),
              )
          : undefined
      }
      removeFailure={failure}
      contract={
        hasContract && (
          <ContractSection contract={contract} builds={builds?.builds} />
        )
      }
      assignees={<AssigneesControl target={{ concept: concept.slug }} />}
    >
      {builds && search.section === 'Build' && (
        <LinkedBuilds builds={builds.builds} reason={builds.reason} />
      )}
      {signals && listed && (
        <Signals
          signals={listed}
          reason={signals.reason}
          onMakeInsight={(urls) =>
            setPicked(signals.signals.filter(({ url }) => urls.includes(url)))
          }
          onOpenInsight={(recordId, event) => {
            const opened = listed.find(
              ({ insight }) => insight?.id === recordId,
            )
            if (opened?.insight) open(opened.insight.href, event)
          }}
        />
      )}
    </ConceptView>
  )
}

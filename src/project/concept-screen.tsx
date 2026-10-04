import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import type { Concept } from '../db/parts.ts'
import type { ContractState } from '../db/contracts.ts'
import type { ProjectSignals, Signal } from '../db/signals.ts'
import { ConceptView } from '../design-system/concept-view.tsx'
import { PartCards } from '../design-system/part-cards.tsx'
import { Signals } from '../design-system/signals.tsx'
import { ContractSection } from './contract-screen.tsx'
import { NameFormScreen } from './name-form-screen.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { UNKNOWN_CONCEPT, isPartType, lensTypes } from './project-search.ts'
import { SignalInsightScreen } from './signal-insight-screen.tsx'
import { useProjectLinks } from './use-project-links.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// One Concept in the main window, with the lens of the section. The section
// Understand shows the Signals of the Project too. The form that the address
// names takes the place of the Concept. So does the form of the Insight that
// grows from the picked Signals. The section Mine shows the Parts of the
// whole Project that need the owner.
export function ConceptScreen({
  concept,
  contract,
  signals,
}: {
  concept: Concept
  contract: ContractState
  signals?: ProjectSignals
}) {
  const { parts, mine } = projectRoute.useLoaderData()
  const { search, conceptHref, recordHref, open, changeSearch } =
    useProjectLinks()
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

  if (search.section === 'Mine') {
    return (
      <PartCards
        title="Mine"
        parts={mine.map((part) => ({
          id: part.id,
          type: part.type,
          title: part.title,
          trust: part.trust,
          workState: part.workState,
          concept: part.conceptTitle,
          href: recordHref(part),
        }))}
        onOpen={({ href }, event) => open(href, event)}
      />
    )
  }

  // A Concept with no Part and no Version has nothing to sign.
  const hasContract =
    contract.versions.length > 0 ||
    concept.parts.length > 0 ||
    concept.concepts.length > 0

  return (
    <ConceptView
      concept={concept}
      types={lensTypes(search.section)}
      partHref={recordHref}
      conceptHref={({ slug }) => conceptHref(slug)}
      onOpenPart={(part, event) => open(recordHref(part), event)}
      onOpenConcept={({ slug }, event) => open(conceptHref(slug), event)}
      onAddPart={(type) => void changeSearch({ ...search, add: type })}
      onAddConcept={() => void changeSearch({ ...search, add: 'concept' })}
      contract={hasContract && <ContractSection contract={contract} />}
    >
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

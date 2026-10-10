import { getRouteApi, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import type { Ask, AskPart } from '../db/asks.ts'
import type { ProjectBuilds } from '../db/builds.ts'
import type {
  Concept,
  ConceptNode,
  MapJoint,
  Part,
  PartSummary,
} from '../db/parts.ts'
import type { ContractQuestion } from '../db/contract-questions.ts'
import type { ContractState } from '../db/contracts.ts'
import type { ProjectIntegrations } from '../db/integration-actions.ts'
import { applySignalFilters } from '../db/signal-filter-rule.ts'
import type { SignalFilter } from '../db/signal-filters.ts'
import type { ProjectSignals, Signal } from '../db/signals.ts'
import { partTypes } from '../design-system/card.tsx'
import { ConceptView } from '../design-system/concept-view.tsx'
import type { NextAction } from '../design-system/next-box.tsx'
import { PartCards } from '../design-system/part-cards.tsx'
import type { PartCardsAsk } from '../design-system/part-cards.tsx'
import { flagReasons } from '../design-system/record.tsx'
import { SectionView } from '../design-system/section-view.tsx'
import { Signals } from '../design-system/signals.tsx'
import { AssigneesControl } from './assignees-control.tsx'
import { findConceptFlow, findSignalsFlow } from './common-flow.ts'
import { ContractQuestionsSection } from './contract-questions-section.tsx'
import type { NextStep } from './common-flow.ts'
import { ContractSection, useVersionHref } from './contract-screen.tsx'
import {
  FailedIntegrationsSection,
  IntegrationsScreen,
} from './integrations-screen.tsx'
import { KindFormScreen } from './kind-form-screen.tsx'
import { LinkedBuilds } from './linked-builds.tsx'
import { MapPanelScreen, MapScreen } from './map-screen.tsx'
import { NameFormScreen } from './name-form-screen.tsx'
import { PartFormScreen } from './part-form-screen.tsx'
import { toReading } from './part-views.ts'
import { PeopleScreen } from './people-screen.tsx'
import { UNKNOWN_CONCEPT, isPartType, lensTypes } from './project-search.ts'
import { SignalFilterFormScreen } from './signal-filter-form-screen.tsx'
import { SignalInsightScreen } from './signal-insight-screen.tsx'
import { useProjectLinks } from './use-project-links.ts'
import { useWrite } from './use-write.ts'

const projectRoute = getRouteApi('/_signed-in/$project')

// The slugs of the Concepts and of each Concept in them.
function listSlugs(concepts: ReadonlyArray<ConceptNode>): Array<string> {
  return concepts.flatMap((node) => [node.slug, ...listSlugs(node.concepts)])
}

// One Concept in the main window, or one section. The Concept in the address
// is the filter of a section: the section lists the Parts of the Concept and
// of the Concepts in it for its Part types, so the whole Project at the root
// Concept. The Operational ones show in detail, the Strategic ones as a
// summary. The section Understand shows the Signals
// of the Project too, and the section Build its builds. The section Use
// shows its Metrics and its measured Goals, each with its newest value
// against its target. The section Mine shows the Parts that need the owner,
// the open questions that the person answers, and the Parts that the person
// watches. The section People shows the
// members of the Project. The form that the address names takes the place of
// the screen: a new Part, a new Concept, a new Project, or a Kind. So does
// the form of the Insight that grows from the picked Signals, and the form
// of a saved filter of the Signals, and the Integrations that bring the
// Signals. The Map keeps the lens of the section.
export function ConceptScreen({
  concept,
  contract,
  signals,
  signalFilters = [],
  integrations = { tools: [], integrations: [] },
  builds,
  mapJoints,
  panelPart,
  questions,
}: {
  concept: Concept
  contract: ContractState
  // The questions about the Contract Versions of the Concept. None: the
  // Concept has no Version, or a section is open.
  questions?: ReadonlyArray<ContractQuestion>
  signals?: ProjectSignals
  // The saved filters of the Signals of the Project.
  signalFilters?: ReadonlyArray<SignalFilter>
  // The Integrations of the Project: the tools that bring its Signals.
  integrations?: ProjectIntegrations
  // In the section Build: the builds of the Project. With no section: the
  // builds that name the Contract of the Concept.
  builds?: ProjectBuilds
  // In the map view: the Joints of the Project, and the record that the
  // panel of the Map shows.
  mapJoints?: ReadonlyArray<MapJoint>
  panelPart?: Part
}) {
  const router = useRouter()
  const {
    project: { kinds },
    parts,
    mine,
    newFlagCount,
    asks,
    watched,
    measured,
    questions: mineQuestions,
    failedIntegrations,
  } = projectRoute.useLoaderData()
  const {
    updateConcept,
    removeConcept,
    pickAsk,
    startStudy,
    handBackAsk,
    addJoint,
    addSignalInsight,
    signContract,
    setFlagsSeen,
  } = projectRoute.useRouteContext()
  const { project, search, conceptHref, recordHref, open, changeSearch } =
    useProjectLinks()
  const { pending, failure, write } = useWrite()
  const versionHref = useVersionHref()
  // The next step of the Concept or of the Signals has its own write: its
  // box shows that it saves, or why it failed.
  const {
    pending: stepPending,
    failure: stepFailure,
    write: writeStep,
  } = useWrite()
  // The Hunch of a group of Signals has its own write: the list shows at
  // the group that it saves, or why it was not made.
  const {
    pending: hunchPending,
    failure: hunchFailure,
    write: writeHunch,
  } = useWrite()
  // The pick of a Kind has its own write too: it shows at the Kind field.
  const {
    pending: kindPending,
    failure: kindFailure,
    write: writeKind,
  } = useWrite()
  const [hunchGroup, setHunchGroup] = useState<string>()
  const [picked, setPicked] = useState<ReadonlyArray<Signal>>()
  // The saved filters that are on, and the filter that the form shows: a
  // saved one with its id, a new one with none.
  const [filtersOn, setFiltersOn] = useState<ReadonlySet<number>>(new Set())
  const [filterForm, setFilterForm] = useState<{ id?: number }>()
  // The Integrations take the place of the Signals that they bring.
  const [showsIntegrations, setShowsIntegrations] = useState(false)
  const setFilterOn = (id: number, on: boolean) =>
    setFiltersOn((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  // Mine is open: the person saw the new flags, so the count beside Mine
  // goes away (glue/D61).
  const seesFlags = search.section === 'Mine' && newFlagCount > 0
  useEffect(() => {
    if (!seesFlags) return
    void setFlagsSeen({ project }).then(() => router.invalidate())
  }, [seesFlags, setFlagsSeen, project, router])

  if (isPartType(search.add)) {
    // The key gives each Part type its own form with its own values.
    return <PartFormScreen key={search.add} type={search.add} parts={parts} />
  }
  if (search.add === 'kind' || search.kind)
    return <KindFormScreen key={search.kind} slug={search.kind} />
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
  if (filterForm) {
    return (
      <SignalFilterFormScreen
        sources={signals?.sources ?? []}
        filter={signalFilters.find(({ id }) => id === filterForm.id)}
        filters={signalFilters}
        // The filter that the form saved is on.
        onClose={(saved) => {
          if (saved !== undefined) setFilterOn(saved, true)
          setFilterForm(undefined)
        }}
      />
    )
  }
  if (showsIntegrations && search.section === 'Understand') {
    return (
      <IntegrationsScreen
        {...integrations}
        onClose={() => setShowsIntegrations(false)}
      />
    )
  }
  if (search.section === 'People') return <PeopleScreen />

  // The saved filters that are on apply before the groups are made, so the
  // groups and their titles follow them. None is on: the list of the server.
  const applied = signalFilters.filter(({ id }) => filtersOn.has(id))
  const passed =
    signals && applied.length > 0
      ? applySignalFilters(signals.signals, applied)
      : signals
  const listed = passed?.signals.map((signal) => ({
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

  // The Hunch of a group is a draft in the open Concept. The server gives
  // it the title of the group. Then the member is on the Hunch, where the
  // flow goes on. `save` is the write that shows it: the one of the group,
  // or the one of the next step.
  const makeHunch = (urls: ReadonlyArray<string>, save: typeof write) =>
    void save(
      'Saving',
      () =>
        addSignalInsight({
          project,
          insight: { signals: [...urls], concept: concept.slug },
        }),
      ({ id }) =>
        router.navigate({
          to: '/$project/$concept/$recordId',
          params: { project, concept: concept.slug, recordId: id },
          search: { section: search.section, pins: search.pins },
        }),
    )

  const levels = new Map(parts.map(({ id, flightLevel }) => [id, flightLevel]))
  // What comes live from the tools of a section, after its Parts.
  const live = (
    <>
      {builds && search.section === 'Build' && (
        <LinkedBuilds builds={builds.builds} reason={builds.reason} />
      )}
      {signals && passed && listed && (
        <Signals
          signals={listed}
          sources={signals.sources}
          failures={signals.failures}
          groups={passed.groups}
          savedFilters={signalFilters.map(({ id, name }) => ({
            id,
            name,
            selected: filtersOn.has(id),
          }))}
          onSavedFilterChange={setFilterOn}
          onAddFilter={() => setFilterForm({})}
          onEditFilter={(id) => setFilterForm({ id })}
          onOpenIntegrations={() => setShowsIntegrations(true)}
          hunch={
            hunchGroup === undefined
              ? undefined
              : {
                  group: hunchGroup,
                  pending: hunchPending,
                  failure: hunchFailure,
                }
          }
          onMakeInsight={(urls) =>
            setPicked(signals.signals.filter(({ url }) => urls.includes(url)))
          }
          onMakeHunch={(urls) => {
            setHunchGroup(urls[0])
            makeHunch(urls, writeHunch)
          }}
          // The flow from evidence to an Insight starts at the Signals
          // (glue/D68): the next step makes the Hunch of the largest group.
          findFlow={(groups) => {
            const flow = findSignalsFlow(groups)
            if (!flow) return undefined
            const { name, steps, current, next } = flow
            return {
              bar: { name, steps, current },
              next: {
                actions: [
                  {
                    label: next.label,
                    onClick: () => makeHunch(next.signals, writeStep),
                  },
                ],
                pending: stepPending,
                error: stepFailure,
              },
            }
          }}
          onOpenInsight={(recordId, event) => {
            const opened = listed.find(
              ({ insight }) => insight?.id === recordId,
            )
            if (opened?.insight) open(opened.insight.href, event)
          }}
        />
      )}
    </>
  )

  const toCard = (part: PartSummary) => ({
    id: part.id,
    type: part.type,
    title: part.title,
    trust: part.trust,
    emptySlots: part.emptySlots,
    reviewNotes: part.reviewNotes,
    workState: part.workState,
    concept: part.conceptTitle,
    home: part.concept,
    flightLevel: levels.get(part.id) ?? 'strategic',
    href: recordHref(part),
  })

  // The card of an Ask is a Part of the other Project: the Part that waits
  // for the asked member, the Part that came back for the member who asked.
  const toAskCard = (shown: AskPart, note?: string) => ({
    id: shown.id,
    type: shown.type,
    title: shown.title,
    trust: shown.trust,
    concept: shown.project.name,
    note,
    href: recordHref(shown, shown.project.slug),
  })
  // The Parts that a member can hand back: the kind of the Ask is their type.
  const published = parts.filter(({ workState }) => workState === 'published')
  const toAsk = ({
    id: askId,
    kind,
    step,
    part: hunch,
    question,
    handedBack: insight,
    study,
  }: Ask): PartCardsAsk => {
    if (step === 'check' && insight) {
      return {
        id: askId,
        part: toAskCard(insight, `${hunch.id} ${hunch.title}`),
        action: {
          label: 'Check and glue',
          onClick: () =>
            void write('Saving', () =>
              addJoint({
                project,
                joint: {
                  part: hunch.id,
                  needs: `${insight.project.slug}/${insight.id}`,
                },
              }),
            ),
        },
      }
    }
    // An Ask with a study is answered from the study.
    if (study) {
      return {
        id: askId,
        part: toAskCard(hunch, question ?? undefined),
        action: {
          label: 'Open study',
          onClick: () =>
            void router.navigate({ href: conceptHref(study.slug, {}) }),
        },
      }
    }
    const fitting = published.filter(({ type }) => type === kind)
    return {
      id: askId,
      part: toAskCard(hunch, question ?? undefined),
      otherAction:
        step === 'hand-back'
          ? {
              label: 'Start study',
              onClick: () =>
                void write(
                  'Saving',
                  () => startStudy({ project, askId }),
                  ({ slug }) =>
                    router.navigate({ href: conceptHref(slug, {}) }),
                ),
            }
          : undefined,
      action:
        step === 'pick'
          ? {
              label: 'Pick',
              onClick: () =>
                void write('Saving', () => pickAsk({ project, askId })),
            }
          : fitting.length === 0
            ? // No Part to hand back yet: the step is to add one.
              {
                label: `Add ${partTypes[kind]}`,
                onClick: () => void changeSearch({ ...search, add: kind }),
              }
            : {
                label: 'Hand back',
                pick: {
                  label: partTypes[kind],
                  parts: fitting.map((part) => ({
                    ...part,
                    href: recordHref(part),
                  })),
                  onPick: (recordId) =>
                    void write('Saving', () =>
                      handBackAsk({ project, askId, part: recordId }),
                    ),
                },
              },
    }
  }

  if (search.section === 'Mine') {
    return (
      <PartCards
        title="Mine"
        parts={mine.map(toCard)}
        asks={asks.map(toAsk)}
        pending={pending}
        error={failure}
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
      >
        {/* One child or none: with none, Mine says that it is empty. */}
        {mineQuestions.length + failedIntegrations.integrations.length > 0 && (
          <>
            {mineQuestions.length > 0 && (
              <ContractQuestionsSection questions={mineQuestions} />
            )}
            {failedIntegrations.integrations.length > 0 && (
              <FailedIntegrationsSection {...failedIntegrations} />
            )}
          </>
        )}
      </PartCards>
    )
  }
  const types = lensTypes(search.section)
  if (search.section && types && search.view !== 'map') {
    const homes = new Set([concept.slug, ...listSlugs(concept.concepts)])
    const isListed = (part: PartSummary) => homes.has(part.concept)
    return (
      <SectionView
        title={search.section}
        types={types}
        parts={
          search.section === 'Use'
            ? measured.filter(isListed).map((part) => ({
                ...toCard(part),
                reading: toReading(part.measure),
              }))
            : parts
                .filter((part) => types.includes(part.type) && isListed(part))
                .map(toCard)
        }
        detail={search.detail}
        onDetailChange={(detail) =>
          void changeSearch({ ...search, detail: detail || undefined })
        }
        onOpen={({ href }, event) => open(href, event)}
        onAddPart={(type) => void changeSearch({ ...search, add: type })}
      >
        {live}
      </SectionView>
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

  // The common flow of a Concept that has something to fill or to sign. A
  // lens shows a part of the Concept, so no flow.
  const flow =
    search.section === undefined &&
    (hasContract || contract.emptySlots.length > 0)
      ? findConceptFlow(contract, builds?.builds, concept)
      : undefined
  // The next step opens the form of the empty slot, signs the Concept off,
  // or opens the Part that blocks, the Contract Version or the build.
  const takeStep = (step: NextStep) => {
    switch (step.kind) {
      case 'add':
        return changeSearch({ ...search, add: step.type })
      case 'sign':
        return writeStep('Signing off', () =>
          signContract({ project, concept: concept.slug }),
        )
      case 'open':
        return router.navigate({ href: recordHref(step.part) })
      case 'version':
        return router.navigate({ href: versionHref(step.version) })
      default:
        return undefined
    }
  }
  const step = flow?.next
  // The study of an Ask hands a published Insight back: the first step of
  // the box, before the step of the flow. One Insight goes with a click, one
  // of more with a pick.
  const studyAsk =
    search.section === undefined
      ? asks.find(
          (ask) => ask.study?.slug === concept.slug && ask.step === 'hand-back',
        )
      : undefined
  const findings = concept.parts.filter(
    ({ type, workState }) => type === 'insight' && workState === 'published',
  )
  const handBack = (recordId: string) =>
    studyAsk &&
    void writeStep('Saving', () =>
      handBackAsk({ project, askId: studyAsk.id, part: recordId }),
    )
  const handBackActions: Array<NextAction> =
    !studyAsk || findings.length === 0
      ? []
      : findings.length === 1
        ? [{ label: 'Hand back', onClick: () => handBack(findings[0].id) }]
        : [{ label: 'Hand back', pick: { label: 'Insight', onPick: handBack } }]
  const flowActions: Array<NextAction> =
    !step || step.kind === 'answer'
      ? []
      : step.kind === 'link'
        ? [{ label: step.label, href: step.href }]
        : [{ label: step.label, onClick: () => void takeStep(step) }]

  return (
    <ConceptView
      concept={concept}
      kinds={kinds}
      onKindChange={(kind) =>
        void writeKind('Saving', () =>
          updateConcept({ project, concept: concept.slug, change: { kind } }),
        )
      }
      kindPending={kindPending}
      kindFailure={kindFailure}
      onEditKind={() =>
        void changeSearch({ ...search, kind: concept.kind ?? undefined })
      }
      onAddKind={() => void changeSearch({ ...search, add: 'kind' })}
      view={search.view ?? 'list'}
      onViewChange={(view) =>
        void changeSearch({
          ...search,
          view: view === 'map' ? view : undefined,
        })
      }
      map={mapJoints && <MapScreen focus={concept.slug} joints={mapJoints} />}
      panel={<MapPanelScreen part={panelPart} />}
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
      removePending={pending}
      removeFailure={failure}
      contract={
        // The sign-off is in the box Next, so a Contract with no Version,
        // no Part that blocks and no empty slot has nothing to show.
        hasContract &&
        (contract.versions.length > 0 ||
          contract.blocking.length > 0 ||
          contract.emptySlots.length > 0) && (
          <>
            <ContractSection contract={contract} builds={builds?.builds} />
            {questions && (
              <ContractQuestionsSection
                questions={questions}
                asked={concept.slug}
              />
            )}
          </>
        )
      }
      assignees={<AssigneesControl target={{ concept: concept.slug }} />}
      flow={
        flow && { name: flow.name, steps: flow.steps, current: flow.current }
      }
      ask={concept.ask && { part: toAskCard(concept.ask.part) }}
      next={
        flow || handBackActions.length > 0
          ? {
              actions: [...handBackActions, ...flowActions],
              pending: stepPending,
              error: stepFailure,
              pickParts: findings.map((part) => ({
                ...part,
                href: recordHref(part),
              })),
            }
          : undefined
      }
    >
      {live}
    </ConceptView>
  )
}

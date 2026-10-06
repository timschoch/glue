import { OpenPanelRight } from '@carbon/icons-react'
import { IconButton } from '@carbon/react'
import {
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ViewportPortal,
} from '@xyflow/react'
import type {
  Edge,
  EdgeProps,
  Node,
  NodeProps,
  ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Card, partTypes, signs } from './card.tsx'
import { PADDING, layoutMapView } from './concept-map-elk.ts'
import type { MapLayout, MapPoint, MapRoute } from './concept-map-elk.ts'
import { listGlued, toMapView } from './concept-map-layout.ts'
import type { MapLine, MapNode, MapView } from './concept-map-layout.ts'
import styles from './concept-map.module.scss'
import type { ConceptMapProps } from './concept-map.tsx'
import { ConceptSummary } from './concept-view.tsx'

// The pointer is off a node for this time before the Map is normal again:
// on the way from one node to the next it stays as it is.
const HOVER_END_MS = 250
// The radius of a corner of a line, and the size of its arrowhead.
const CORNER = 5
const ARROW = { length: 7, width: 3.5 }
// The title of a Concept is `heading-compact-01`, 14 px. A fit shows it no
// smaller than `label-01`, 12 px.
const FLOOR = 12 / 14
// The whole Map shows in its frame, at its full size at most.
const FIT = { minZoom: FLOOR, maxZoom: 1, padding: `${PADDING}px` } as const

type FlowNode = Node<{ node: MapNode }, 'node'>
type FlowEdge = Edge<
  { line: MapLine; route: MapRoute; name: string; dimmed: boolean },
  'line'
>

// What a node does, and what the Map does when the focus is on it.
type MapActions = Pick<
  ConceptMapProps,
  | 'current'
  | 'partHref'
  | 'conceptHref'
  | 'projectHref'
  | 'onOpenPart'
  | 'onOpenConcept'
> & {
  onToggle: (slug: string) => void
  // True one time, for the Concept that the last toggle opened or closed.
  onTakeFocus: (slug: string, open: boolean) => boolean
  onLight: (id: string) => void
  onUnlight: () => void
}

const ActionsContext = createContext<MapActions | undefined>(undefined)

// The panel shows the Concept or the record of the node.
function isCurrent(node: MapNode, current: string | undefined): boolean {
  if (current === undefined) return false
  if (node.kind === 'part') return node.part.id === current
  return node.kind === 'concept' && node.slug === current
}

// The point on the way from `from` to `to`, `length` pixels from `from`.
function move(from: MapPoint, to: MapPoint, length: number): MapPoint {
  const whole = Math.hypot(to.x - from.x, to.y - from.y)
  const share = whole === 0 ? 0 : Math.min(length, whole / 2) / whole
  return {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
  }
}

// The line through the points, with round corners.
function toPath(points: ReadonlyArray<MapPoint>): string {
  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`
      if (index === points.length - 1) return `L ${point.x} ${point.y}`
      const before = move(point, points[index - 1], CORNER)
      const after = move(point, points[index + 1], CORNER)
      return `L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`
    })
    .join(' ')
}

// The arrowhead at the end of the line: it points at the needed Part.
function toArrow(points: ReadonlyArray<MapPoint>): string {
  const [from, tip] = points.slice(-2)
  const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1
  const along = { x: (tip.x - from.x) / length, y: (tip.y - from.y) / length }
  const base = {
    x: tip.x - along.x * ARROW.length,
    y: tip.y - along.y * ARROW.length,
  }
  const side = { x: -along.y * ARROW.width, y: along.x * ARROW.width }
  return `M ${tip.x} ${tip.y} L ${base.x + side.x} ${base.y + side.y} L ${base.x - side.x} ${base.y - side.y} Z`
}

// One node: a closed Concept, an open Concept with its head, a Part or
// another Project.
function MapNodeBody({ data: { node } }: NodeProps<FlowNode>) {
  const actions = use(ActionsContext)
  if (!actions) return null
  const { onToggle, onLight, onUnlight, onOpenPart, onOpenConcept } = actions
  const { partHref, conceptHref, projectHref, onTakeFocus } = actions
  const isOpen = node.kind === 'concept' && node.open
  const current = isCurrent(node, actions.current) || undefined

  function renderBody() {
    if (node.kind === 'part') {
      const { part } = node
      return (
        <Card
          minimal
          type={part.type}
          recordId={part.id}
          title={part.title}
          trust={part.trust}
          current={current}
          href={partHref(part)}
          onOpen={onOpenPart && ((event) => onOpenPart(part, event))}
        />
      )
    }
    if (node.kind === 'project') {
      return (
        <a href={projectHref(node.slug)} className={styles.tile}>
          <span className={styles.title}>{node.title}</span>
        </a>
      )
    }
    const { slug, title } = node
    const summary = (
      <ConceptSummary concept={{ title, partCount: node.count }} />
    )
    // The focus goes to the head of a Concept that a key opened, and to the
    // Concept that a key closed.
    const takeFocus = (open: boolean) => (element: HTMLElement | null) => {
      if (element && onTakeFocus(slug, open))
        element.focus({ preventScroll: true })
    }
    if (node.open) {
      return (
        // A press on the head is a click: the Map does not move with it.
        <div className={`${styles.head} nopan`}>
          {node.expandable ? (
            <button
              ref={takeFocus(true)}
              type="button"
              aria-expanded
              aria-current={current}
              className={`${styles.headTitle} ${styles.headToggle}`}
              onClick={() => onToggle(slug)}
            >
              {title}
            </button>
          ) : (
            <span aria-current={current} className={styles.headTitle}>
              {title}
            </span>
          )}
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom-end"
            label={`Show ${title} in the panel`}
            onClick={(event) => onOpenConcept?.(slug, event)}
          >
            <OpenPanelRight />
          </IconButton>
        </div>
      )
    }
    return node.expandable ? (
      <button
        ref={takeFocus(false)}
        type="button"
        aria-expanded={false}
        aria-current={current}
        className={styles.tile}
        onClick={() => onToggle(slug)}
      >
        {summary}
      </button>
    ) : (
      <a
        href={conceptHref(slug)}
        aria-current={current}
        className={styles.tile}
        onClick={onOpenConcept && ((event) => onOpenConcept(slug, event))}
      >
        {summary}
      </a>
    )
  }

  return (
    <div
      // React Flow starts no move of the Map from an element with `nopan`:
      // a press on a node is a click. A drag on the ground of an open Concept
      // moves the Map.
      className={isOpen ? styles.body : `${styles.body} nopan`}
      onFocus={() => onLight(node.id)}
      onBlur={onUnlight}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={styles.handle}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={styles.handle}
      />
      {renderBody()}
    </div>
  )
}

// One bundle of Joints: its line with the arrowhead, and its count. The count
// has the name of the line and takes the focus for it: it comes after the
// nodes.
function MapLineBody({ id, data }: EdgeProps<FlowEdge>) {
  const actions = use(ActionsContext)
  if (!data || !actions) return null
  const { onLight, onUnlight } = actions
  const { line, route, name, dimmed } = data
  const look = `${styles[line.trust]} ${line.dashed ? styles.dashed : ''}`

  return (
    <>
      <BaseEdge
        path={toPath(route.points)}
        className={`${styles.line} ${look}`}
      />
      <path d={toArrow(route.points)} className={`${styles.arrow} ${look}`} />
      <ViewportPortal>
        <span
          role="group"
          aria-label={name}
          // The focus on a line shows what it glues.
          tabIndex={0}
          className={dimmed ? `${styles.pill} ${styles.dimmed}` : styles.pill}
          style={{
            transform: `translate(-50%, -50%) translate(${route.pill.x}px, ${route.pill.y}px)`,
          }}
          onFocus={() => onLight(id)}
          onBlur={onUnlight}
          onMouseEnter={() => onLight(id)}
          onMouseLeave={onUnlight}
        >
          {line.count}
        </span>
      </ViewportPortal>
    </>
  )
}

const nodeTypes = { node: MapNodeBody }
const edgeTypes = { line: MapLineBody }

// The name of a node, for the name of a line.
function toName(node: MapNode | undefined): string {
  if (!node) return ''
  return node.kind === 'part'
    ? `${partTypes[node.part.type]} ${node.part.id}`
    : node.title
}

// The Map on React Flow. ELK gives each node its place and each line its
// route: no node moves. The Map keeps the places of the view before, until
// ELK has the new ones.
export function ConceptMapFlow({
  tree,
  parts,
  joints,
  focus,
  expanded,
  onExpandedChange,
  current,
  partHref,
  conceptHref,
  projectHref,
  onOpenPart,
  onOpenConcept,
}: ConceptMapProps) {
  const view = useMemo(
    () => toMapView({ tree, parts, joints, focus, expanded }),
    [tree, parts, joints, focus, expanded],
  )
  const [placed, setPlaced] = useState<{ view: MapView; layout: MapLayout }>()
  useEffect(() => {
    let isStale = false
    void layoutMapView(view).then((layout) => {
      if (!isStale) setPlaced({ view, layout })
    })
    return () => {
      isStale = true
    }
  }, [view])

  // The node or the line under the pointer or with the focus.
  const [lit, setLit] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const light = useCallback((id: string) => {
    clearTimeout(timer.current)
    setLit(id)
  }, [])
  const unlight = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setLit(undefined), HOVER_END_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const flow = useRef<ReactFlowInstance<FlowNode, FlowEdge>>(undefined)
  const frame = useRef<HTMLElement>(null)
  const size = placed?.layout

  // The frame takes the height that is left in the window below its top.
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () =>
      element.style.setProperty(
        '--map-top',
        `${element.getBoundingClientRect().top + window.scrollY}px`,
      )
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const [room, setRoom] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      setRoom({ width: element.clientWidth, height: element.clientHeight }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const isBigger =
    size !== undefined && (size.width > room.width || size.height > room.height)

  // The Concept that the last toggle opened or closed: the focus goes to it.
  const toggled = useRef<{ slug: string; open: boolean }>(undefined)
  // React Flow fits the Map at first sight, with each new layout and with
  // each new size of the frame.
  const fit = useCallback(async () => {
    const instance = flow.current
    if (!instance) return
    await instance.fitView(FIT)
    // A Map too big for its frame at the floor starts at its left top corner.
    const { x, y, zoom } = instance.getViewport()
    if (x < 0 || y < 0)
      await instance.setViewport({ x: Math.max(x, 0), y: Math.max(y, 0), zoom })
  }, [])
  useEffect(() => void fit(), [fit, placed, room])

  const actions = useMemo(
    () => ({
      current,
      partHref,
      conceptHref,
      projectHref,
      onOpenPart,
      onOpenConcept,
      onToggle: (slug: string) => {
        toggled.current = { slug, open: !expanded.includes(slug) }
        onExpandedChange(
          expanded.includes(slug)
            ? expanded.filter((open) => open !== slug)
            : [...expanded, slug],
        )
      },
      onTakeFocus: (slug: string, open: boolean) => {
        const last = toggled.current
        if (last?.slug !== slug || last.open !== open) return false
        toggled.current = undefined
        return true
      },
      onLight: light,
      onUnlight: unlight,
    }),
    [
      current,
      partHref,
      conceptHref,
      projectHref,
      onOpenPart,
      onOpenConcept,
      onExpandedChange,
      expanded,
      light,
      unlight,
    ],
  )

  const { nodes, edges } = useMemo(() => {
    if (!placed) return { nodes: [], edges: [] }
    const { layout } = placed
    const isShown =
      lit !== undefined &&
      [...placed.view.nodes, ...placed.view.lines].some(({ id }) => id === lit)
    const glued = isShown ? listGlued(placed.view, lit) : undefined
    const boxes = new Map(layout.boxes.map((box) => [box.id, box]))
    const routes = new Map(layout.routes.map((route) => [route.id, route]))
    const byId = new Map(placed.view.nodes.map((node) => [node.id, node]))

    return {
      nodes: placed.view.nodes.flatMap((node): Array<FlowNode> => {
        const box = boxes.get(node.id)
        if (!box) return []
        const { width, height } = box
        const isOpen = node.kind === 'concept' && node.open
        return [
          {
            id: node.id,
            type: 'node',
            parentId: node.parent,
            position: { x: box.x, y: box.y },
            width,
            height,
            measured: { width, height },
            // The places of the handles: React Flow draws no line without.
            handles: [
              {
                type: 'target',
                position: Position.Left,
                x: 0,
                y: height / 2,
                width: 1,
                height: 1,
              },
              {
                type: 'source',
                position: Position.Right,
                x: width,
                y: height / 2,
                width: 1,
                height: 1,
              },
            ],
            data: { node },
            className: [
              isOpen ? styles.area : styles.node,
              node.outside && styles.outside,
              isCurrent(node, current) && styles.current,
              glued && !glued.nodes.includes(node.id) && styles.dimmed,
            ]
              .filter(Boolean)
              .join(' '),
          },
        ]
      }),
      edges: placed.view.lines.flatMap((line): Array<FlowEdge> => {
        const route = routes.get(line.id)
        if (!route) return []
        const dimmed = glued !== undefined && !glued.lines.includes(line.id)
        return [
          {
            id: line.id,
            type: 'line',
            source: line.from,
            target: line.to,
            data: {
              line,
              route,
              name: `${toName(byId.get(line.from))} needs ${toName(byId.get(line.to))}: ${line.count} ${line.count === 1 ? 'Joint' : 'Joints'}, ${signs[line.trust].word.toLowerCase()}`,
              dimmed,
            },
            className: dimmed ? `${styles.edge} ${styles.dimmed}` : styles.edge,
            // The count on the line takes the focus and has the name.
            focusable: false,
            domAttributes: { 'aria-hidden': true },
          },
        ]
      }),
    }
  }, [placed, lit, current])

  return (
    <figure ref={frame} aria-label="Map" className={styles.map}>
      {placed && size && (
        <ActionsContext value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flow.current = instance
              void fit()
            }}
            // An open Concept is the ground of its nodes: the pointer on it
            // changes nothing.
            onNodeMouseEnter={(_, { id, data }) => {
              if (data.node.kind !== 'concept' || !data.node.open) light(id)
            }}
            onNodeMouseLeave={unlight}
            onEdgeMouseEnter={(_, { id }) => light(id)}
            onEdgeMouseLeave={unlight}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            elementsSelectable={false}
            translateExtent={[
              [0, 0],
              [size.width, size.height],
            ]}
            // A Map bigger than its frame moves with the wheel. A smaller one
            // lets the page scroll.
            panOnScroll={isBigger}
            preventScrolling={isBigger}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            // The member zooms out to the whole Map of a Project in a narrow
            // window.
            minZoom={0.1}
            maxZoom={2}
          >
            <Controls showFitView={false} showInteractive={false} />
          </ReactFlow>
        </ActionsContext>
      )}
    </figure>
  )
}

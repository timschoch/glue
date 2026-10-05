import { OpenPanelRight } from '@carbon/icons-react'
import { Button, IconButton } from '@carbon/react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
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
  useMemo,
  useRef,
  useState,
} from 'react'

import { Card, partTypes } from './card.tsx'
import { layoutMapView } from './concept-map-elk.ts'
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

type FlowNode = Node<{ node: MapNode }, 'node'>
type FlowEdge = Edge<
  { line: MapLine; route: MapRoute; dimmed: boolean },
  'line'
>

// What a node does, and what the Map does when the focus is on it.
type MapActions = Pick<
  ConceptMapProps,
  'partHref' | 'conceptHref' | 'projectHref' | 'onOpenPart' | 'onOpenConcept'
> & {
  onToggle: (slug: string) => void
  onLight: (id: string) => void
  onUnlight: () => void
}

const ActionsContext = createContext<MapActions | undefined>(undefined)

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
  const { partHref, conceptHref, projectHref } = actions

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
    if (node.open) {
      return (
        <div className={styles.head}>
          {node.expandable ? (
            <Button
              kind="ghost"
              size="sm"
              aria-expanded
              onClick={() => onToggle(slug)}
            >
              {title}
            </Button>
          ) : (
            <span className={styles.headTitle}>{title}</span>
          )}
          <IconButton
            kind="ghost"
            size="sm"
            align="bottom-end"
            label={`Open ${title}`}
            onClick={(event) => onOpenConcept?.(slug, event)}
          >
            <OpenPanelRight />
          </IconButton>
        </div>
      )
    }
    return node.expandable ? (
      <button
        type="button"
        aria-expanded={false}
        className={styles.tile}
        onClick={() => onToggle(slug)}
      >
        {summary}
      </button>
    ) : (
      <a
        href={conceptHref(slug)}
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
      // a press on a node is a click.
      className={`${styles.body} nopan`}
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

// One bundle of Joints: its line with the arrowhead, and its count.
function MapLineBody({ data }: EdgeProps<FlowEdge>) {
  if (!data) return null
  const { line, route, dimmed } = data
  const look = `${styles[line.trust]} ${line.dashed ? styles.dashed : ''}`

  return (
    <>
      <BaseEdge
        path={toPath(route.points)}
        className={`${styles.line} ${look}`}
      />
      <path d={toArrow(route.points)} className={`${styles.arrow} ${look}`} />
      <EdgeLabelRenderer>
        <span
          className={dimmed ? `${styles.pill} ${styles.dimmed}` : styles.pill}
          style={{
            transform: `translate(-50%, -50%) translate(${route.pill.x}px, ${route.pill.y}px)`,
          }}
        >
          {line.count}
        </span>
      </EdgeLabelRenderer>
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
  const fit = useCallback(() => {
    if (!size) return
    void flow.current?.fitBounds(
      { x: 0, y: 0, width: size.width, height: size.height },
      { padding: 0.01 },
    )
  }, [size])
  // The whole Map shows after each layout and in each width of its frame.
  const [inlineSize, setInlineSize] = useState(0)
  useEffect(() => {
    fit()
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setInlineSize(element.clientWidth)
      fit()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [fit])
  // A Map wider than its frame shows smaller, and is that much lower.
  const scale = size && inlineSize ? Math.min(1, inlineSize / size.width) : 1

  const actions = useMemo(
    () => ({
      partHref,
      conceptHref,
      projectHref,
      onOpenPart,
      onOpenConcept,
      onToggle: (slug: string) =>
        onExpandedChange(
          expanded.includes(slug)
            ? expanded.filter((open) => open !== slug)
            : [...expanded, slug],
        ),
      onLight: light,
      onUnlight: unlight,
    }),
    [
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
            data: { line, route, dimmed },
            className: dimmed ? styles.dimmed : undefined,
            ariaLabel: `${toName(byId.get(line.from))} needs ${toName(byId.get(line.to))}: ${line.count} ${line.count === 1 ? 'Joint' : 'Joints'}`,
            domAttributes: {
              onFocus: () => light(line.id),
              onBlur: unlight,
            },
          },
        ]
      }),
    }
  }, [placed, lit, light, unlight])

  return (
    <figure
      ref={frame}
      aria-label="Map"
      className={styles.map}
      style={{ blockSize: size && size.height * scale }}
    >
      {placed && (
        <ActionsContext value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flow.current = instance
              fit()
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
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            minZoom={0.2}
            maxZoom={1}
          />
        </ActionsContext>
      )}
    </figure>
  )
}

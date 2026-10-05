import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// A record that a body names: `#D12`, or `flexibeck#F2` for a record of
// another Project (D37). `#glue/D4` names one too, in the form of a
// reference (D45).
export type Mention = { project?: string; recordId: string }

// A node of the Markdown tree, as far as the mentions need it.
export type MarkdownNode = {
  type: string
  value?: string
  url?: string
  data?: { hProperties?: Record<string, unknown> }
  children?: Array<MarkdownNode>
}

// A record id with its `#`, in upper or lower case. The slug of a Project
// can come before the `#`, or after it with a `/`.
const MENTION =
  /([a-z0-9]+(?:-[a-z0-9]+)*)?#(?:([a-z0-9]+(?:-[a-z0-9]+)*)\/)?([a-z]\d+)\b/gi

// A link has its own target, so a record id in it stays text.
const LINK_TYPES = new Set(['link', 'linkReference'])

// Replaces each mention in the texts below a node with the node that
// `toNode` gives for it. No node: the mention stays text. Code is not text,
// so a record id in it is no mention.
export function replaceMentions(
  node: MarkdownNode,
  toNode: (mention: Mention) => MarkdownNode | undefined,
) {
  if (!node.children || LINK_TYPES.has(node.type)) return
  node.children = node.children.flatMap((child) => {
    const { value } = child
    if (child.type !== 'text' || value === undefined) {
      replaceMentions(child, toNode)
      return [child]
    }
    const nodes: Array<MarkdownNode> = []
    let textStart = 0
    for (const match of value.matchAll(MENTION)) {
      const [text, slugBefore, slugAfter, recordId] = match
      // A group that did not match is undefined, the type says string.
      const project = slugAfter || slugBefore
      const mentionNode = toNode({
        ...(project && { project: project.toLowerCase() }),
        recordId: recordId.toUpperCase(),
      })
      if (!mentionNode) continue
      if (match.index > textStart)
        nodes.push({ type: 'text', value: value.slice(textStart, match.index) })
      nodes.push(mentionNode)
      textStart = match.index + text.length
    }
    if (textStart < value.length)
      nodes.push({ type: 'text', value: value.slice(textStart) })
    return nodes
  })
}

const markdown = unified().use(remarkParse).use(remarkGfm)

// The records that a Markdown body names, each one once, in their order.
export function findMentions(body: string): Array<Mention> {
  const mentions = new Map<string, Mention>()
  replaceMentions(markdown.parse(body), (mention) => {
    mentions.set(`${mention.project ?? ''}#${mention.recordId}`, mention)
    return undefined
  })
  return [...mentions.values()]
}

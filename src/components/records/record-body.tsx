import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import classes from './record-body.module.css'

// The record title is the h1 of the page: a heading in the text goes one level down.
const headings = { h1: 'h2', h2: 'h3', h3: 'h4', h4: 'h5', h5: 'h6' } as const

// An Insight can hold text from outside, such as an issue. An image in it
// would tell its server who reads the record.
const disallowedElements = ['img']

export function RecordBody({ body }: { body: string }) {
  if (body.trim() === '') {
    return <p className={classes.empty}>This record has no text yet.</p>
  }

  return (
    <div className={classes.body}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={headings}
        disallowedElements={disallowedElements}
      >
        {body}
      </Markdown>
    </div>
  )
}

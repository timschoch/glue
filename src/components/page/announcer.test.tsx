// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { renderInRouter } from '../../test/render.tsx'
import { Announcer, useAnnouncer } from './announcer.tsx'

// A button that goes away after its action, like Keep and Accept.
function Action({ focusId }: { focusId: string }) {
  const { announce, claimFocus } = useAnnouncer()
  const [done, setDone] = useState(false)

  return done ? (
    <h2 id="later" tabIndex={-1} ref={claimFocus}>
      Later
    </h2>
  ) : (
    <button
      onClick={() => {
        announce('Kept I3.', focusId)
        setDone(true)
      }}
    >
      Keep
    </button>
  )
}

function renderAction(focusId: string) {
  return renderInRouter(
    <Announcer>
      <h1 id="now" tabIndex={-1}>
        Now
      </h1>
      <Action focusId={focusId} />
    </Announcer>,
  )
}

describe('Announcer', () => {
  it('says nothing before an action', async () => {
    await renderAction('now')

    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('says the result of an action and moves the focus', async () => {
    await renderAction('now')

    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(screen.getByRole('status').textContent).toBe('Kept I3.')
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Now' }),
    )
  })

  it('moves the focus to an element that comes after the action', async () => {
    await renderAction('later')

    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))

    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Later' }),
    )
  })
})

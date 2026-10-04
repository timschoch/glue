import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Carbon's text area and dialog watch their size, which jsdom can not do.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

// jsdom has no scrollTo, the router calls it after a navigation.
window.scrollTo = () => {}

// jsdom has no matchMedia, Carbon's side nav asks it for the breakpoint.
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})

afterEach(cleanup)

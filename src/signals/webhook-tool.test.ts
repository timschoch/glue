import { describe, expect, it } from 'vitest'

import { webhookTool } from './webhook-tool.ts'

describe('the name of a webhook', () => {
  it.each(['Helpdesk', 'CRM 2', 'sales_inbox-eu', 'Büro', 'a'.repeat(60)])(
    'takes %s',
    (name) => {
      expect(webhookTool.findAddressProblem(name)).toBeUndefined()
    },
  )

  it.each(['Help/desk', 'a.b', '<b>CRM</b>', 'a'.repeat(61)])(
    'refuses %s',
    (name) => {
      expect(webhookTool.findAddressProblem(name)).toBe(
        'A name has at most 60 characters: letters, digits, spaces, "-" and "_"',
      )
    },
  )
})

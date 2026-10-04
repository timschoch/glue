import { createFileRoute } from '@tanstack/react-router'

import { handleInboundMail } from '../../api/mail-api.ts'
import { getMailClient } from '../../mail/mail.server.ts'
import { findSetting } from '../../settings.server.ts'

export const Route = createFileRoute('/api/mail/inbound')({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleInboundMail({
          request,
          webhookSecret: findSetting('RESEND_WEBHOOK_SECRET'),
          client: getMailClient(),
          // Nothing in Glue reacts to a mail yet.
          onMail: () => Promise.resolve(),
        }),
    },
  },
})

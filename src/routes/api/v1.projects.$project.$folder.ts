import { createFileRoute } from '@tanstack/react-router'

import { folderHandlers } from '../../api/concept-routes.ts'

export const Route = createFileRoute('/api/v1/projects/$project/$folder')({
  server: { handlers: folderHandlers },
})

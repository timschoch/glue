import { createFileRoute, redirect } from '@tanstack/react-router'

// Without a Product in the address, Glue shows its own Concept.
export const Route = createFileRoute('/_signed-in/')({
  beforeLoad: () => {
    throw redirect({ to: '/$product', params: { product: 'glue' } })
  },
})

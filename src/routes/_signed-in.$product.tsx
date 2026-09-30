import { createFileRoute, notFound } from '@tanstack/react-router'

import { MissingProductState } from '../components/page/page-state.tsx'

// Each page of a Product is below this route.
export const Route = createFileRoute('/_signed-in/$product')({
  // The page frame has the Products. No second request to the server.
  loader: async ({ params, parentMatchPromise }) => {
    const { loaderData: products } = await parentMatchPromise
    if (!products?.some(({ slug }) => slug === params.product)) throw notFound()
  },
  head: ({ match, params }) => ({
    meta:
      match.status === 'notFound'
        ? [{ title: `No Product ${params.product} | Glue` }]
        : [],
  }),
  notFoundComponent: MissingProduct,
})

function MissingProduct() {
  return <MissingProductState product={Route.useParams().product} />
}

import { createFileRoute } from '@tanstack/react-router'
import {
  HelpCenterRoute,
  helpRouteLoader,
} from '@/components/help-center/route'

/** /help/<locale>/<category>/<slug>, every level optional (helpRoute). */
export const Route = createFileRoute('/help/$')({
  loader: ({ params }) => helpRouteLoader(params._splat ?? ''),
  component: function HelpCenterPage() {
    return <HelpCenterRoute route={Route.useLoaderData()} />
  },
})

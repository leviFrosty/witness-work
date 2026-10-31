import { createFileRoute } from '@tanstack/react-router'
import {
  HelpCenterRoute,
  helpRouteLoader,
} from '@/components/help-center/route'

export const Route = createFileRoute('/help/')({
  loader: () => helpRouteLoader(''),
  component: function HelpCenterHome() {
    return <HelpCenterRoute route={Route.useLoaderData()} />
  },
})

import { createFileRoute } from '@tanstack/react-router'
import Landing from '@/components/landing/landing'
import { localeParam } from '@/lib/route-params'

export const Route = createFileRoute('/$locale/')({
  loader: ({ params }) => ({ locale: localeParam(params.locale) }),
  component: function LocalizedLanding() {
    return <Landing locale={Route.useLoaderData().locale} />
  },
})

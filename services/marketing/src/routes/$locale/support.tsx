import { createFileRoute } from '@tanstack/react-router'
import { SupportPage } from '@/components/landing/support'
import { localeParam } from '@/lib/route-params'

export const Route = createFileRoute('/$locale/support')({
  loader: ({ params }) => ({ locale: localeParam(params.locale) }),
  component: function LocalizedSupport() {
    return <SupportPage locale={Route.useLoaderData().locale} />
  },
})

import {
  Asset,
  createRootRoute,
  useRouterState,
  useTags,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { NotFoundPage } from '@/components/landing/not-found'
import { localeDirection } from '@/lib/help-center/locales'
import { pageLocale } from '@/lib/paths'
import { SITE } from '@/lib/site'
import { loadContent } from '@/server/content'
import appCss from '@/styles/app.css?url'

export const Route = createRootRoute({
  loader: async () => {
    await loadContent()
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/images/icon.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/images/icon.png' },
    ],
  }),
  shellComponent: Shell,
  notFoundComponent: NotFoundPage,
})

/**
 * The route's head tags without the router's script preloads: pages are static
 * HTML, and nothing loads the router in the browser (README.md).
 */
function Head() {
  const tags = useTags().filter(
    (tag) => !(tag.tag === 'link' && tag.attrs?.rel === 'modulepreload')
  )
  return tags.map((tag) => (
    <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} />
  ))
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const locale = pageLocale(pathname)
  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <head>
        <Head />
        {!SITE.indexable && <meta name='robots' content='noindex' />}
      </head>
      <body>{children}</body>
    </html>
  )
}

import type { LaunchLinkReader } from '@/lib/launchLinkReader'
import { createKeptWebLink, type KeptWebLink } from '@/lib/webLinks/keptWebLink'
import {
  pendingWebLink,
  readWebLinkAddress,
  type WebLinkKind,
} from '@/lib/webLinks/pendingWebLink'
import { sealedSecrets } from '@/lib/webStorage/sealedSecrets'

const READERS: Record<WebLinkKind, LaunchLinkReader> = {
  contact: 'contact-import',
  buddyInvite: 'buddy-invite',
}

type Page = Pick<Window, 'addEventListener' | 'location' | 'history'>

type Deps = {
  kept: KeptWebLink

  onOpened?: (kind: WebLinkKind, details: { kept: boolean }) => void
}

export function createWebLinks({ kept, onOpened }: Deps) {
  const listeners = new Set<(url: string) => void>()
  let ready: Promise<void> = Promise.resolve()
  let started = false

  let active = false

  async function keep(): Promise<void> {
    const current = pendingWebLink.current()
    if (!current || current.handed) return
    await kept.save(current.kind, current.link)
  }

  function take(reader: LaunchLinkReader): string | null {
    const current = pendingWebLink.current()
    if (!current || current.handed || READERS[current.kind] !== reader)
      return null
    return current.link
  }

  function onHashChange(page: Page) {
    const address = readWebLinkAddress(page.location.href)
    if (!address?.link) return
    page.history.replaceState(page.history.state, '', address.withoutFragment)
    pendingWebLink.set(address.kind, address.link)

    if (active) void keep().catch(() => undefined)
    for (const listener of [...listeners]) listener(address.link)
  }

  return {
    start(page: Page, { activeTab }: { activeTab: boolean }): Promise<void> {
      if (started) return ready
      started = true
      active = activeTab
      page.addEventListener('hashchange', () => onHashChange(page))
      if (!active) return ready
      ready = (async () => {
        if (pendingWebLink.current()) return keep()
        const restored = await kept.read()
        if (restored && !pendingWebLink.current())
          pendingWebLink.set(restored.kind, restored.link, { kept: true })
      })().catch(() => undefined)
      return ready
    },

    keepForReload(waitMs = 1_000): Promise<void> {
      let timer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        keep().catch(() => undefined),
        new Promise<void>((resolve) => (timer = setTimeout(resolve, waitMs))),
      ]).finally(() => clearTimeout(timer))
    },

    keepAcrossWipe: (): Promise<void> => keep().catch(() => undefined),

    async launchURL(reader: LaunchLinkReader): Promise<string | null> {
      await ready
      return take(reader)
    },

    linkSinceLaunch: take,

    addLinkListener(listener: (url: string) => void) {
      listeners.add(listener)
      return { remove: () => void listeners.delete(listener) }
    },

    opened(url: string) {
      const current = pendingWebLink.current()
      if (!current || current.handed || current.link !== url) return
      pendingWebLink.markHanded()
      void kept.forget().catch(() => undefined)
      onOpened?.(current.kind, { kept: current.kept })
    },
  }
}

export type WebLinks = ReturnType<typeof createWebLinks>

export const webLinks = createWebLinks({
  kept: createKeptWebLink({ secrets: sealedSecrets }),

  onOpened: (kind, { kept }) =>
    (
      require('@/lib/analytics') as typeof import('@/lib/analytics')
    ).analytics.capture('web_link_opened', { kind, kept }),
})

import type { LaunchLinkReader } from '@/lib/launchLinkReader'
import { createKeptWebLink, type KeptWebLink } from '@/lib/webLinks/keptWebLink'
import {
  pendingWebLink,
  readWebLinkAddress,
  type WebLinkKind,
} from '@/lib/webLinks/pendingWebLink'
import { sealedSecrets } from '@/lib/webStorage/sealedSecrets'

/**
 * Web: how a contact share or Buddies invite link in the web app's address
 * reaches the app's own link listeners (`ContactImportListener`,
 * `BuddyInviteListener`), through `launchLinks.web.ts`. Web only; the phones'
 * launch links don't come here.
 *
 * - The web entry takes the fragment out of the address before anything else
 *   loads (`scrubLaunchAddress.web.ts`), into memory (`pendingWebLink`).
 * - Once storage is up, `start` seals it (`keptWebLink.ts`), so a reload before
 *   the app opens it brings it back; or restores one sealed before.
 * - In a tab already open, a new fragment on a link route (`hashchange`) leaves
 *   the address the same way.
 * - The listeners only mount past the sign-in screen and App Lock. Each link goes
 *   to its kind's listener once; then its sealed copy is deleted, so reloading
 *   never opens it again.
 */

/** The listener each kind of link is for. */
const READERS: Record<WebLinkKind, LaunchLinkReader> = {
  contact: 'contact-import',
  buddyInvite: 'buddy-invite',
}

type Page = Pick<Window, 'addEventListener' | 'location' | 'history'>

type Deps = {
  kept: KeptWebLink
  /** A link reached the app's listener. */
  onOpened?: (kind: WebLinkKind, details: { kept: boolean }) => void
}

export function createWebLinks({ kept, onOpened }: Deps) {
  const listeners = new Set<(url: string) => void>()
  let ready: Promise<void> = Promise.resolve()
  let started = false
  /**
   * This tab runs the app. One showing "open in another tab" never reads or
   * seals the one sealed link the browser keeps, which would hand it to the
   * wrong tab or bring back one already opened; it seals its own only for Use
   * Here.
   */
  let active = false

  /** Seals the waiting link for a reload, unless the app already opened it. */
  async function keep(): Promise<void> {
    const current = pendingWebLink.current()
    if (!current || current.handed) return
    await kept.save(current.kind, current.link)
  }

  /** The waiting link for `reader`, until its listener opens it. */
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
    // Until its listener opens it, as one from the address: behind the
    // sign-in screen or App Lock, the listeners aren't mounted yet.
    if (active) void keep().catch(() => undefined)
    for (const listener of [...listeners]) listener(address.link)
  }

  return {
    /**
     * Before the app loads, once storage is up: in the tab that runs the app,
     * seals the address's link for a reload, or restores one sealed before.
     * Listens for links that come to this tab later.
     */
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
    /**
     * Seals the waiting link before this page reloads on purpose (Use Here),
     * waiting at most `waitMs`.
     */
    keepForReload(waitMs = 1_000): Promise<void> {
      let timer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        keep().catch(() => undefined),
        new Promise<void>((resolve) => (timer = setTimeout(resolve, waitMs))),
      ]).finally(() => clearTimeout(timer))
    },
    /**
     * Seals it again after a sign-in wiped another account's data, the sealed
     * copy with it, before the page reloads into the new account.
     */
    keepAcrossWipe: (): Promise<void> => keep().catch(() => undefined),
    /**
     * `launchURL` on the web: the waiting link, for its kind's listener, until
     * the listener opens it. A listener that mounts again before then (App Lock
     * unmounts the app) gets it again.
     */
    async launchURL(reader: LaunchLinkReader): Promise<string | null> {
      await ready
      return take(reader)
    },
    /** `linkSinceLaunch` on the web. */
    linkSinceLaunch: take,
    /** `addLinkListener` on the web: links that come while the app is open. */
    addLinkListener(listener: (url: string) => void) {
      listeners.add(listener)
      return { remove: () => void listeners.delete(listener) }
    },
    /**
     * `linkOpened` on the web: the listener showed `url`'s prompt or screen.
     * It's done: never handed out again, and no reload brings it back.
     */
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

/** The page's. */
export const webLinks = createWebLinks({
  kept: createKeptWebLink({ secrets: sealedSecrets }),
  // Required here, so the web entry doesn't load analytics before storage.
  onOpened: (kind, { kept }) =>
    (
      require('@/lib/analytics') as typeof import('@/lib/analytics')
    ).analytics.capture('web_link_opened', { kind, kept }),
})

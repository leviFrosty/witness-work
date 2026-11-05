import {
  APP_LINK_HOST,
  LEGACY_APP_LINK_HOST,
  appLinkPaths,
} from '@/constants/appLinks'

/**
 * The links the web app opens from its own address: what "Continue on the web"
 * on a contact or Buddies link page opens (docs/app-links.md "Without the
 * app"), `/contacts#…` and `/buddies/invite#…`, and the old host's short paths
 * `/c#…` and `/b#…`, which the old host's pages build. Memory only: the web
 * entry reads it before any other module loads (`scrubLaunchAddress.web.ts`),
 * so nothing that reports the address ever sees the fragment.
 */

export type WebLinkKind = 'contact' | 'buddyInvite'

const WEB_LINK_KINDS: readonly WebLinkKind[] = ['contact', 'buddyInvite']

/**
 * The longest fragment kept, far longer than any link the app makes. A longer
 * one is cut here, and the cut payload no longer decodes, so the parsers refuse
 * it with the same message as any other bad link.
 */
export const MAX_WEB_LINK_FRAGMENT = 16_384

export type WebLinkAddress = {
  kind: WebLinkKind
  /**
   * The link as the native parsers read it, on the apex's full-word path, or
   * null when the address has no fragment.
   */
  link: string | null
  /** The address without its fragment. */
  withoutFragment: string
}

/** The old host's short path (`/c`) and the full words (`/contacts`). */
const pathsOf = (kind: WebLinkKind) => appLinkPaths(LEGACY_APP_LINK_HOST, kind)

/** The full words alone, as the apex reads them. */
const fullPath = (kind: WebLinkKind) => appLinkPaths(APP_LINK_HOST, kind)[0]

/** What `kind`'s parsers read: `https://witnesswork.app/contacts#<fragment>`. */
export const webLinkFor = (kind: WebLinkKind, fragment: string) =>
  `https://${APP_LINK_HOST}${fullPath(kind)}#${fragment.slice(0, MAX_WEB_LINK_FRAGMENT)}`

/**
 * Reads an address of the web app as a link route: its kind, the link its
 * fragment makes, and the address without it. Null for any other path. The path
 * matches exactly, as the native apps match it, with one trailing `/` allowed;
 * the query is ignored.
 */
export function readWebLinkAddress(href: string): WebLinkAddress | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const path =
    url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname
  const kind = WEB_LINK_KINDS.find((each) => pathsOf(each).includes(path))
  if (!kind) return null
  const fragment = url.hash.slice(1)
  url.hash = ''
  return {
    kind,
    link: fragment ? webLinkFor(kind, fragment) : null,
    withoutFragment: url.toString(),
  }
}

export type PendingWebLink = {
  kind: WebLinkKind
  link: string
  /** It waited in sealed storage across a reload (`keptWebLink.ts`). */
  kept: boolean
  /** The app's listener has it; it isn't kept for a reload any more. */
  handed: boolean
}

let pending: PendingWebLink | null = null

/**
 * The link waiting for the app to open it, in this page only: from the address,
 * a fragment change in an open tab, or restored after a reload. It waits
 * through the sign-in screen, storage and App Lock, since the app's link
 * listeners only mount past them.
 */
export const pendingWebLink = {
  current: (): PendingWebLink | null => pending,
  /** A new link, which replaces any other still waiting. */
  set(kind: WebLinkKind, link: string, { kept = false } = {}) {
    pending = { kind, link, kept, handed: false }
  },
  /** The listener has it: a reload no longer brings it back. */
  markHanded() {
    if (pending) pending = { ...pending, handed: true }
  },
  clear() {
    pending = null
  },
}

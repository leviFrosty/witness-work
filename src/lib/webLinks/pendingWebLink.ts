import {
  APP_LINK_HOST,
  LEGACY_APP_LINK_HOST,
  appLinkPaths,
} from '@/constants/appLinks'

export type WebLinkKind = 'contact' | 'buddyInvite'

const WEB_LINK_KINDS: readonly WebLinkKind[] = ['contact', 'buddyInvite']

export const MAX_WEB_LINK_FRAGMENT = 16_384

export type WebLinkAddress = {
  kind: WebLinkKind

  link: string | null

  withoutFragment: string
}

const pathsOf = (kind: WebLinkKind) => appLinkPaths(LEGACY_APP_LINK_HOST, kind)

const fullPath = (kind: WebLinkKind) => appLinkPaths(APP_LINK_HOST, kind)[0]

export const webLinkFor = (kind: WebLinkKind, fragment: string) =>
  `https://${APP_LINK_HOST}${fullPath(kind)}#${fragment.slice(0, MAX_WEB_LINK_FRAGMENT)}`

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

  kept: boolean

  handed: boolean
}

let pending: PendingWebLink | null = null

export const pendingWebLink = {
  current: (): PendingWebLink | null => pending,

  set(kind: WebLinkKind, link: string, { kept = false } = {}) {
    pending = { kind, link, kept, handed: false }
  },

  markHanded() {
    if (pending) pending = { ...pending, handed: true }
  },
  clear() {
    pending = null
  },
}

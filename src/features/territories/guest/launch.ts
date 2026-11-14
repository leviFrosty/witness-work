import { GUEST_LINK_PATH } from '@/lib/sharedSpaces/scopes'

type Page = Pick<Window, 'location' | 'history'>

let fragment: string | null = null

export const isGuestPagePath = (pathname: string) =>
  pathname.replace(/\/+$/, '') === GUEST_LINK_PATH

export function guestPageAddress(href: string): {
  url: string
  fragment: string | null
} | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (!isGuestPagePath(url.pathname)) return null
  const hash = url.hash.replace(/^#/, '')
  return { url: `${url.origin}${GUEST_LINK_PATH}`, fragment: hash || null }
}

export function showGuestLink(
  shown: string | null,
  { location, history }: Page = window
) {
  const address = guestPageAddress(location.href)
  if (!address) return
  const href = shown ? `${address.url}#${shown}` : address.url
  if (href !== location.href) history.replaceState(null, '', href)
}

export function takeGuestPageAddress(page: Page): boolean {
  const address = guestPageAddress(page.location.href)
  if (!address) return false
  fragment = address.fragment
  showGuestLink(address.fragment, page)
  return true
}

export const guestLaunch = {
  take(): string | null {
    const taken = fragment
    fragment = null
    return taken
  },
}

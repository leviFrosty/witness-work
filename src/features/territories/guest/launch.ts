import { GUEST_LINK_PATH } from '@/lib/sharedSpaces/scopes'

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

export function takeGuestPageAddress({
  location,
  history,
}: Pick<Window, 'location' | 'history'>): boolean {
  const address = guestPageAddress(location.href)
  if (!address) return false
  fragment = address.fragment
  if (address.url !== location.href) history.replaceState(null, '', address.url)
  return true
}

export const guestLaunch = {
  take(): string | null {
    const taken = fragment
    fragment = null
    return taken
  },
}

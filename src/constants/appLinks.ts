import links from '@/constants/appLinks.json'
import { CREATE_LINKS_ON_NEW_HOST } from '@/constants/appLinkSwitch'

/**
 * The app's universal links and App Links (ADR 0042 §3, docs/app-links.md): the
 * hosts the app reads, the paths each kind of link uses there, and how a link
 * is matched. The hosts and paths live in `appLinks.json`, which
 * `app.config.ts` claims from too. Where new links are made is
 * `CREATE_LINKS_ON_NEW_HOST` (`appLinkSwitch.ts`).
 */

/** The old host. Every build claims and reads it, forever (ADR 0042 §2). */
export const LEGACY_APP_LINK_HOST = links.legacyHost
/** The new apex. Its link pages are served by ww-api. */
export const APP_LINK_HOST = links.host
/**
 * The dev ww-api's apex. Only development builds claim it, but every build
 * reads it: its links carry the same self-contained fragments, so reading one
 * pasted or scanned is no different from the apex.
 */
export const DEV_APP_LINK_HOST = links.devHost
/**
 * The web app. Never an app-link host, but its "Continue on the web" links
 * carry the same fragments, so the scrubber covers it.
 */
export const WEB_APP_HOST = links.webAppHost

export const APP_LINK_HOSTS = [
  APP_LINK_HOST,
  DEV_APP_LINK_HOST,
  LEGACY_APP_LINK_HOST,
] as const

export const APP_LINK_KINDS = ['contact', 'buddyInvite', 'handoff'] as const
export type AppLinkKind = (typeof APP_LINK_KINDS)[number]

/** Each kind's full-word path, which every host reads. */
const PATHS: Record<AppLinkKind, string> = links.paths
/** Each kind's short path, which only the old host reads. */
const LEGACY_PATHS: Record<AppLinkKind, string> = links.legacyPaths

/**
 * Contact links from older app versions carry the payload in the path
 * (`/c/<payload>`), on the old host only.
 */
export const LEGACY_CONTACT_PATH_PREFIX = links.legacyContactPathPrefix

/**
 * The paths links of `kind` use on `host`: the short one and the full words on
 * the old host, only the full words on the new ones, none off the app's hosts.
 */
export function appLinkPaths(host: string, kind: AppLinkKind): string[] {
  const name = host.toLowerCase()
  if (name === LEGACY_APP_LINK_HOST) return [LEGACY_PATHS[kind], PATHS[kind]]
  if (name === APP_LINK_HOST || name === DEV_APP_LINK_HOST) return [PATHS[kind]]
  return []
}

/** What a new link of `kind` starts with; its fragment follows a `#`. */
export function appLinkBase(kind: AppLinkKind): string {
  return CREATE_LINKS_ON_NEW_HOST
    ? `https://${APP_LINK_HOST}${PATHS[kind]}`
    : `https://${LEGACY_APP_LINK_HOST}${LEGACY_PATHS[kind]}`
}

/** `text` as a regular expression source that matches it literally. */
export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** `text` as a regular expression source that matches it in any letter case. */
const anyCase = (text: string) =>
  [...text]
    .map((char) => {
      const lower = char.toLowerCase()
      const upper = char.toUpperCase()
      return lower === upper ? escapeRegExp(char) : `[${lower}${upper}]`
    })
    .join('')

const SCHEME = `${anyCase('https')}:\\/\\/`
/** A trailing slash and a query string, both ignored. */
const AFTER_PATH = '\\/?(?:\\?[^#\\s]*)?'

/**
 * A regular expression source for a link of `kind` up to its `#`: `https://`, a
 * host that reads the kind, one of its paths there, then an optional `/` and
 * query. The scheme and host match in any case, the path exactly, as iOS and
 * Android match it. No anchors or flags.
 */
export function appLinkBasePattern(kind: AppLinkKind): string {
  const bases = APP_LINK_HOSTS.map(
    (host) =>
      `${anyCase(host)}(?:${appLinkPaths(host, kind).map(escapeRegExp).join('|')})`
  )
  return `${SCHEME}(?:${bases.join('|')})${AFTER_PATH}`
}

const WHOLE_LINK = Object.fromEntries(
  APP_LINK_KINDS.map((kind) => [
    kind,
    new RegExp(`^${appLinkBasePattern(kind)}(?:#(.*))?$`),
  ])
) as Record<AppLinkKind, RegExp>

/**
 * Reads `text`, all of it apart from surrounding space, as a link of `kind`:
 * what follows its `#`, `''` when there's nothing, or `null` when `text` isn't
 * such a link.
 */
export function appLinkFragment(
  text: string,
  kind: AppLinkKind
): string | null {
  const match = WHOLE_LINK[kind].exec(text.trim())
  return match ? (match[1] ?? '') : null
}

const LEGACY_CONTACT_PATH = new RegExp(
  `^${SCHEME}${anyCase(LEGACY_APP_LINK_HOST)}${escapeRegExp(LEGACY_CONTACT_PATH_PREFIX)}([^\\/?#\\s]+)${AFTER_PATH}(?:#.*)?$`
)

/**
 * Reads `text` as an old-host contact link from an older app version, with the
 * payload in the path (`/c/<payload>`): the payload, or `null`.
 */
export function legacyContactPathPayload(text: string): string | null {
  return LEGACY_CONTACT_PATH.exec(text.trim())?.[1] ?? null
}

/** Letters Java's `compareToIgnoreCase` reads as ASCII ones. */
const ASCII_LOOKALIKES: Record<string, string> = {
  İ: 'i',
  ı: 'i',
  ſ: 's',
  K: 'k',
}

/**
 * The host of `url` as Android matches it against intent filters, or `null` for
 * anything but an `https://` link: the authority ends at `/`, `\`, `?` or `#`,
 * the host follows its last `@` and precedes any port, and it's percent-decoded
 * and compared ignoring case the Java way (`ı` is `i`).
 */
function systemHost(url: string): string | null {
  const authority = /^https:\/\/([^/\\?#]*)/i.exec(url.trim())?.[1]
  if (authority === undefined) return null
  const host = authority.slice(authority.lastIndexOf('@') + 1).split(':')[0]
  let decoded = host
  try {
    decoded = decodeURIComponent(host)
  } catch {
    // Android decodes what it can; an undecodable host is none of the app's.
  }
  return decoded
    .replace(/[İıſK]/g, (char) => ASCII_LOOKALIKES[char])
    .toLowerCase()
}

/**
 * Whether `url` is one of the app's own links, which the system would hand
 * straight back to the app: anything on the old host, and the claimed paths on
 * the new ones (the website lives on the apex too), however the link is
 * written. Reads the URL the way the system does, so it covers every link the
 * parsers read and more: a port, a user name, a percent-encoded path. The host
 * is read as Android reads it (`systemHost`), and where Android reads a path
 * more loosely than `URL` (a port out of range), the link counts as the app's
 * own: forwarding a link the system opens the app with would reopen the app.
 */
export function isOwnAppLink(url: string): boolean {
  const host = systemHost(url)
  if (host === LEGACY_APP_LINK_HOST) return true
  if (host !== APP_LINK_HOST && host !== DEV_APP_LINK_HOST) return false
  let pathname: string
  try {
    pathname = new URL(url.trim()).pathname
  } catch {
    return true
  }
  let path: string
  try {
    path = decodeURIComponent(pathname)
  } catch {
    // Android decodes a stray `%` to U+FFFD, never one of the exact paths.
    return false
  }
  const withoutSlash = path.endsWith('/') ? path.slice(0, -1) : path
  return APP_LINK_KINDS.some((kind) =>
    appLinkPaths(host, kind).includes(withoutSlash)
  )
}

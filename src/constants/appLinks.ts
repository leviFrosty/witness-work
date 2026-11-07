import links from '@/constants/appLinks.json'
import { CREATE_LINKS_ON_NEW_HOST } from '@/constants/appLinkSwitch'

export const LEGACY_APP_LINK_HOST = links.legacyHost

export const APP_LINK_HOST = links.host

export const DEV_APP_LINK_HOST = links.devHost

export const WEB_APP_HOST = links.webAppHost

export const APP_LINK_HOSTS = [
  APP_LINK_HOST,
  DEV_APP_LINK_HOST,
  LEGACY_APP_LINK_HOST,
] as const

export const APP_LINK_KINDS = ['contact', 'buddyInvite', 'handoff'] as const
export type AppLinkKind = (typeof APP_LINK_KINDS)[number]

const PATHS: Record<AppLinkKind, string> = links.paths

const LEGACY_PATHS: Record<AppLinkKind, string> = links.legacyPaths

export const LEGACY_CONTACT_PATH_PREFIX = links.legacyContactPathPrefix

export function appLinkPaths(host: string, kind: AppLinkKind): string[] {
  const name = host.toLowerCase()
  if (name === LEGACY_APP_LINK_HOST) return [LEGACY_PATHS[kind], PATHS[kind]]
  if (name === APP_LINK_HOST || name === DEV_APP_LINK_HOST) return [PATHS[kind]]
  return []
}

export function appLinkBase(kind: AppLinkKind): string {
  return CREATE_LINKS_ON_NEW_HOST
    ? `https://${APP_LINK_HOST}${PATHS[kind]}`
    : `https://${LEGACY_APP_LINK_HOST}${LEGACY_PATHS[kind]}`
}

export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const anyCase = (text: string) =>
  [...text]
    .map((char) => {
      const lower = char.toLowerCase()
      const upper = char.toUpperCase()
      return lower === upper ? escapeRegExp(char) : `[${lower}${upper}]`
    })
    .join('')

const SCHEME = `${anyCase('https')}:\\/\\/`

const AFTER_PATH = '\\/?(?:\\?[^#\\s]*)?'

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

export function legacyContactPathPayload(text: string): string | null {
  return LEGACY_CONTACT_PATH.exec(text.trim())?.[1] ?? null
}

const ASCII_LOOKALIKES: Record<string, string> = {
  İ: 'i',
  ı: 'i',
  ſ: 's',
  K: 'k',
}

function systemHost(url: string): string | null {
  const authority = /^https:\/\/([^/\\?#]*)/i.exec(url.trim())?.[1]
  if (authority === undefined) return null
  const host = authority.slice(authority.lastIndexOf('@') + 1).split(':')[0]
  let decoded = host
  try {
    decoded = decodeURIComponent(host)
  } catch {}
  return decoded
    .replace(/[İıſK]/g, (char) => ASCII_LOOKALIKES[char])
    .toLowerCase()
}

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
    return false
  }
  const withoutSlash = path.endsWith('/') ? path.slice(0, -1) : path
  return APP_LINK_KINDS.some((kind) =>
    appLinkPaths(host, kind).includes(withoutSlash)
  )
}

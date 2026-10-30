import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { gzipSync, strToU8 } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { isOwnAppLink } from '@/constants/appLinks'
import { toB64u } from '@/features/buddies/lib/bytes'
import {
  isInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import {
  isContactShareLink,
  parseContactShareLink,
} from '@/features/contacts/lib/contactShareLink'
import { shouldForwardToSystem } from '@/features/contacts/lib/systemLinks'
import {
  buildHandoffLink,
  createHandoffOffer,
  isHandoffLink,
  parseHandoffLink,
} from '@/lib/serverAccount/handoff'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Every form of every app link, run through its parser, the "own link" check
 * and the hand-off to the system, which must agree (docs/app-links.md): what a
 * parser reads as an app link is the app's own and never goes back to the
 * system.
 */

type Kind = 'contact' | 'buddyInvite' | 'handoff'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const contactPayload = toB64u(gzipSync(strToU8('{"contact":{"id":"c1"}}')))
const handoffLink = buildHandoffLink(createHandoffOffer(random).offer)

const FRAGMENT: Record<Kind, string> = {
  contact: contactPayload,
  buddyInvite: `1${toB64u(random(16))}`,
  handoff: handoffLink.slice(handoffLink.indexOf('#') + 1),
}

const PARSER: Record<Kind, (url: string) => boolean> = {
  contact: (url) =>
    isContactShareLink(url) && parseContactShareLink(url) !== null,
  buddyInvite: (url) => isInviteLink(url) && parseInviteSecret(url) !== null,
  handoff: (url) => isHandoffLink(url) && parseHandoffLink(url).ok,
}

const OLD = 'ww-proxy.leviwilkerson.com'
const ORIGINS: Record<Kind, string[]> = {
  contact: [
    `https://${OLD}/c`,
    `https://${OLD}/contacts`,
    'https://witnesswork.app/contacts',
    'https://dev.witnesswork.app/contacts',
  ],
  buddyInvite: [
    `https://${OLD}/b`,
    `https://${OLD}/buddies/invite`,
    'https://witnesswork.app/buddies/invite',
    'https://dev.witnesswork.app/buddies/invite',
  ],
  handoff: [
    `https://${OLD}/h`,
    `https://${OLD}/accounts/handoff`,
    'https://witnesswork.app/accounts/handoff',
    'https://dev.witnesswork.app/accounts/handoff',
  ],
}

/** The ways one link may arrive: as made, re-cased, with a slash or query. */
function variants(base: string, fragment: string): string[] {
  const [, scheme, host, path] = /^(https):\/\/([^/]+)(.*)$/.exec(base)!
  return [
    `${base}#${fragment}`,
    `${base}/#${fragment}`,
    `${base}?utm_source=share#${fragment}`,
    `${base}/?lang=es#${fragment}`,
    `${scheme.toUpperCase()}://${host.toUpperCase()}${path}#${fragment}`,
    // iOS capitalizes the first letter of pasted text.
    `Https://${host}${path}#${fragment}`,
  ]
}

const KINDS = Object.keys(ORIGINS) as Kind[]

describe('app link forms', () => {
  describe.each(KINDS)('%s links', (kind) => {
    const accepted = ORIGINS[kind].flatMap((base) =>
      variants(base, FRAGMENT[kind])
    )

    it.each(accepted)('reads %s and keeps it in the app', (url) => {
      expect(PARSER[kind](url)).toBe(true)
      expect(isOwnAppLink(url)).toBe(true)
      expect(shouldForwardToSystem(url)).toBe(false)
      for (const other of KINDS)
        if (other !== kind) expect(PARSER[other](url)).toBe(false)
    })

    const fragment = FRAGMENT[kind]
    const [, , , newPath] = /^(https):\/\/([^/]+)(.*)$/.exec(ORIGINS[kind][2])!
    const shortPath = /^(https):\/\/([^/]+)(.*)$/.exec(ORIGINS[kind][0])![3]
    /** `[url, own]`: none of these parse; `own` says if the app keeps it. */
    const rejected: [string, boolean][] = [
      // Short paths never belong to the new hosts; the website may use them.
      [`https://witnesswork.app${shortPath}#${fragment}`, false],
      [`https://dev.witnesswork.app${shortPath}#${fragment}`, false],
      // Paths match exactly, as iOS and Android match them.
      [`https://witnesswork.app${newPath.toUpperCase()}#${fragment}`, false],
      [`https://witnesswork.app${newPath}x#${fragment}`, false],
      [`https://witnesswork.app${newPath}//#${fragment}`, false],
      [`https://witnesswork.app${newPath}/x#${fragment}`, false],
      // Other hosts, look-alikes, and plain http.
      [`https://app.witnesswork.app${newPath}#${fragment}`, false],
      [`https://evil.example${newPath}#${fragment}`, false],
      [`https://witnesswork.app.evil.example${newPath}#${fragment}`, false],
      [
        `https://evil.example/https://witnesswork.app${newPath}#${fragment}`,
        false,
      ],
      [`http://witnesswork.app${newPath}#${fragment}`, false],
      // A link inside another one. Not forwarded: not an https link.
      [
        `witnesswork://x?u=https://witnesswork.app${newPath}#${fragment}`,
        false,
      ],
      // Everything on the old host is the app's, read or not.
      [`https://${OLD}${newPath}x#${fragment}`, true],
      [`https://${OLD}${shortPath.toUpperCase()}#${fragment}`, true],
      // Claimed paths without a fragment (Android opens them anyway).
      [`https://witnesswork.app${newPath}`, true],
      [`https://${OLD}${shortPath}`, true],
    ]

    it.each(rejected)('never reads %s (own: %s)', (url, own) => {
      for (const parse of Object.values(PARSER)) expect(parse(url)).toBe(false)
      expect(isOwnAppLink(url)).toBe(own)
      expect(shouldForwardToSystem(url)).toBe(!own && /^https?:/.test(url))
    })
  })

  /**
   * Links Android reads more loosely than `URL` does, so it may open the app
   * with them: it takes the host after the last `@`, percent-decodes it,
   * compares it as Java's `compareToIgnoreCase` does, ignores the port, and
   * decodes a stray `%` in the path to U+FFFD. Forwarding one back would reopen
   * the app, again and again.
   */
  it.each([
    `https://${OLD}/c/x/%`,
    `https://${OLD}/c/%E0/x#${FRAGMENT.contact}`,
    `https://${OLD}:99999/c#${FRAGMENT.contact}`,
    `https://a@b@${OLD}:99999/anything`,
    `https://ww-proxy.leviwilKerson.com/c#${FRAGMENT.contact}`,
    `https://witnesswork.app:99999/contacts#${FRAGMENT.contact}`,
    `https://a@b@witnesswork.app:99999/contacts#${FRAGMENT.contact}`,
    `https://%77itnesswork.app:99999/contacts#${FRAGMENT.contact}`,
    `https://witnesswork%2Eapp:99999/contacts#${FRAGMENT.contact}`,
    `https://wıtnesswork.app/contacts#${FRAGMENT.contact}`,
    `https://WİTNESSWORK.APP/contacts#${FRAGMENT.contact}`,
    `https://witneſswork.app/buddies/invite#${FRAGMENT.buddyInvite}`,
    `https://Someone@witnesswork.app/contacts#${FRAGMENT.contact}`,
    `https://witnesswork.app:8443/buddies/invite#${FRAGMENT.buddyInvite}`,
    `https://witnesswork.app/%63ontacts#${FRAGMENT.contact}`,
    `https://witnesswork.app\\accounts\\handoff#${FRAGMENT.handoff}`,
    `https://witnesswork.app/buddies/in\tvite#${FRAGMENT.buddyInvite}`,
  ])('keeps %s in the app without reading it', (url) => {
    for (const parse of Object.values(PARSER)) expect(parse(url)).toBe(false)
    expect(isOwnAppLink(url)).toBe(true)
    expect(shouldForwardToSystem(url)).toBe(false)
  })

  it.each([
    // Android decodes it to `/contacts�`, which no filter claims.
    `https://witnesswork.app/contacts%#${FRAGMENT.contact}`,
    // Other hosts, however the link is written.
    `https://witnesswork.app.evil.example:99999/contacts#${FRAGMENT.contact}`,
    `https://witnesswork.app@evil.example:99999/contacts#${FRAGMENT.contact}`,
    `https://witnesswork.app%2Eevil.example/contacts#${FRAGMENT.contact}`,
    `https:witnesswork.app/contacts#${FRAGMENT.contact}`,
  ])('forwards %s to the system', (url) => {
    for (const parse of Object.values(PARSER)) expect(parse(url)).toBe(false)
    expect(isOwnAppLink(url)).toBe(false)
    expect(shouldForwardToSystem(url)).toBe(true)
  })

  it('reads the old contact form with the payload in the path, old host only', () => {
    const legacy = `https://${OLD}/c/${contactPayload}`
    expect(PARSER.contact(legacy)).toBe(true)
    expect(isOwnAppLink(legacy)).toBe(true)
    expect(shouldForwardToSystem(legacy)).toBe(false)
    for (const url of [
      `https://witnesswork.app/c/${contactPayload}`,
      `https://witnesswork.app/contacts/${contactPayload}`,
      `https://${OLD}/contacts/${contactPayload}`,
    ])
      expect(PARSER.contact(url)).toBe(false)
  })
})

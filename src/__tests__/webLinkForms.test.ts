import { describe, expect, it, vi } from 'vitest'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'
import { isContactShareLink } from '@/features/contacts/lib/contactShareLink'
import { readWebLinkAddress } from '@/lib/webLinks/pendingWebLink'

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// The web app's link routes (docs/app-links.md "Without the app") hand the
// phones' parsers the link they read, for every form a link page opens.
const APP = 'https://app.witnesswork.app'
const PAYLOAD = 'H4sIAAAAAAAAA6tWKkktLlGyUlBKTMpRqgUAzyNhYxIAAAA'
const SECRET = 'AAECAwQFBgcICQoLDA0ODw'

describe('web link routes', () => {
  it.each([
    [`${APP}/contacts#${PAYLOAD}`, isContactShareLink],
    [`${APP}/contacts/?lang=es#${PAYLOAD}`, isContactShareLink],
    [`${APP}/c#${PAYLOAD}`, isContactShareLink],
    [`${APP}/buddies/invite#1${SECRET}`, isInviteLink],
    [`${APP}/b#1${SECRET}`, isInviteLink],
  ])('hands the parsers a link they read from %s', (href, parses) => {
    expect(parses(readWebLinkAddress(href)!.link!)).toBe(true)
  })
})

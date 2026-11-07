import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildHandoffLink,
  createHandoffOffer,
  isHandoffLink,
  parseHandoffLink,
} from '@/lib/serverAccount/handoff'
import { setLinksOnNewHost } from '@/__tests__/helpers/appLinkSwitch'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock(
  '@/constants/appLinkSwitch',
  () => import('@/__tests__/helpers/appLinkSwitch')
)

const HANDOFF_LINK_BASE = 'https://ww-proxy.leviwilkerson.com/h'
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

describe('handoff links on the new hosts', () => {
  afterEach(() => setLinksOnNewHost(false))

  it('makes apex links once the switch flips', () => {
    setLinksOnNewHost(true)
    const { offer } = createHandoffOffer(random)
    const link = buildHandoffLink(offer)
    expect(link).toMatch(/^https:\/\/witnesswork\.app\/accounts\/handoff#1/)
    const parsed = parseHandoffLink(link)
    expect(parsed.ok && parsed.offer.channelId).toBe(offer.channelId)
  })

  it('reads the full-word path on every host', () => {
    const link = buildHandoffLink(createHandoffOffer(random).offer)
    const fragment = link.slice(HANDOFF_LINK_BASE.length)
    for (const [origin, path] of [
      ['https://witnesswork.app', '/accounts/handoff'],
      ['https://dev.witnesswork.app', '/accounts/handoff'],
      ['https://ww-proxy.leviwilkerson.com', '/accounts/handoff'],
    ])
      for (const text of [
        `${origin}${path}${fragment}`,
        `  ${origin}${path}/${fragment}\n`,
        `${origin}${path}?lang=es${fragment}`,
        `${origin.toUpperCase()}${path}${fragment}`,
      ]) {
        expect(parseHandoffLink(text).ok).toBe(true)
        expect(isHandoffLink(text)).toBe(true)
      }
  })

  it('never reads short paths on the new hosts, or a re-cased path', () => {
    const link = buildHandoffLink(createHandoffOffer(random).offer)
    const fragment = link.slice(HANDOFF_LINK_BASE.length)
    for (const base of [
      'https://witnesswork.app/h',
      'https://dev.witnesswork.app/h',
      'https://witnesswork.app/ACCOUNTS/HANDOFF',
      'https://ww-proxy.leviwilkerson.com/H',
      'https://app.witnesswork.app/accounts/handoff',
      'https://witnesswork.app/accounts/handoffs',
    ]) {
      expect(parseHandoffLink(`${base}${fragment}`)).toEqual({
        ok: false,
        problem: 'notHandoff',
      })
      expect(isHandoffLink(`${base}${fragment}`)).toBe(false)
    }
  })
})

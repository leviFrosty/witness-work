import { afterEach, describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/features/buddies/lib/bytes'
import {
  buildInviteLink,
  isInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import { setLinksOnNewHost } from '@/__tests__/helpers/appLinkSwitch'

vi.mock(
  '@/constants/appLinkSwitch',
  () => import('@/__tests__/helpers/appLinkSwitch')
)

const secret = Uint8Array.from({ length: 16 }, (_, i) => i * 7)
const fragment = `#1${toB64u(secret)}`

describe('invite links', () => {
  afterEach(() => setLinksOnNewHost(false))

  it('makes old-host links until the switch flips', () => {
    expect(buildInviteLink(secret)).toBe(
      `https://ww-proxy.leviwilkerson.com/b${fragment}`
    )
  })

  it('makes apex links once it flips', () => {
    setLinksOnNewHost(true)
    const link = buildInviteLink(secret)
    expect(link).toBe(`https://witnesswork.app/buddies/invite${fragment}`)
    expect(parseInviteSecret(`Join me! ${link} see you`)).toEqual(secret)
  })

  it('reads both paths on the old host and the full words on the new hosts', () => {
    for (const base of [
      'https://ww-proxy.leviwilkerson.com/b',
      'https://ww-proxy.leviwilkerson.com/b/',
      'https://ww-proxy.leviwilkerson.com/buddies/invite',
      'https://ww-proxy.leviwilkerson.com/buddies/invite/',
      'https://witnesswork.app/buddies/invite',
      'https://witnesswork.app/buddies/invite/',
      'https://dev.witnesswork.app/buddies/invite',
    ]) {
      expect(parseInviteSecret(`Join me! ${base}${fragment} ok`)).toEqual(
        secret
      )
      expect(isInviteLink(`${base}${fragment}`)).toBe(true)
    }
  })

  it('reads any case of scheme and host, and ignores a query', () => {
    for (const link of [
      `https://witnesswork.app/buddies/invite?x=1${fragment}`,
      `https://WITNESSWORK.APP/buddies/invite${fragment}`,
      `HTTPS://WW-PROXY.LEVIWILKERSON.COM/b${fragment}`,
      `Https://witnesswork.app/buddies/invite${fragment}`,
    ]) {
      expect(parseInviteSecret(link)).toEqual(secret)
      expect(isInviteLink(link)).toBe(true)
    }
  })

  it('opens only a link that starts the text; pasting finds one anywhere', () => {
    const link = `https://witnesswork.app/buddies/invite${fragment}`
    for (const text of [
      `witnesswork://x?u=${link}`,
      `https://evil.example/?u=${link}`,
      `Join me! ${link}`,
    ]) {
      expect(isInviteLink(text)).toBe(false)
      expect(parseInviteSecret(text)).toEqual(secret)
    }
    expect(isInviteLink(` ${link}\n`)).toBe(true)
  })

  it('never reads short paths on the new hosts', () => {
    for (const base of [
      'https://witnesswork.app/b',
      'https://dev.witnesswork.app/b',
      'https://witnesswork.app/BUDDIES/INVITE',
      'https://app.witnesswork.app/buddies/invite',
      'https://evil.example/buddies/invite',
    ])
      expect(parseInviteSecret(`${base}${fragment}`)).toBeNull()
  })
})

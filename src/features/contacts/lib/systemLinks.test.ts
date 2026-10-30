import { describe, expect, it, vi } from 'vitest'
import { shouldForwardToSystem } from '@/features/contacts/lib/systemLinks'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

describe('shouldForwardToSystem', () => {
  it('hands widget quick actions and outside links to the system', () => {
    for (const url of [
      'tel:+15555550100',
      'sms:+15555550100',
      'mailto:ada@example.com',
      'https://maps.google.com/?q=1+Main+St',
      'http://example.com',
    ])
      expect(shouldForwardToSystem(url)).toBe(true)
  })

  it("keeps the app's own links in the app", () => {
    for (const url of [
      // A Buddies invite: forwarding it reopened the app forever on Android.
      'https://ww-proxy.leviwilkerson.com/b#1AAAAAAAAAAAAAAAAAAAAA',
      'https://ww-proxy.leviwilkerson.com/b',
      'https://WW-PROXY.leviwilkerson.com/c#abc',
      'https://ww-proxy.leviwilkerson.com/c/abc',
      'https://ww-proxy.leviwilkerson.com',
      'https://ww-proxy.leviwilkerson.com/buddies/invite#1AAAAAAAAAAAAAAAAAAAAA',
      'https://ww-proxy.leviwilkerson.com/contacts#abc',
      'https://witnesswork.app/buddies/invite#1AAAAAAAAAAAAAAAAAAAAA',
      'https://witnesswork.app/buddies/invite/#1AAAAAAAAAAAAAAAAAAAAA',
      'https://witnesswork.app/accounts/handoff/#1abc',
      'https://witnesswork.app/buddies/invite',
      'https://WITNESSWORK.app/contacts#abc',
      'https://witnesswork.app/accounts/handoff#1abc',
      'https://dev.witnesswork.app/buddies/invite#1AAAAAAAAAAAAAAAAAAAAA',
      'https://dev.witnesswork.app/contacts#abc',
      'witnesswork://shared-good-news',
    ])
      expect(shouldForwardToSystem(url)).toBe(false)
  })

  it('still forwards look-alike hosts', () => {
    expect(
      shouldForwardToSystem('https://ww-proxy.leviwilkerson.com.example.org/b')
    ).toBe(true)
    expect(
      shouldForwardToSystem('https://witnesswork.app.example.org/contacts#abc')
    ).toBe(true)
  })

  it('forwards the website and the web app, which the app never claims', () => {
    for (const url of [
      'https://witnesswork.app/privacy',
      'https://witnesswork.app/help/time/time-rollover',
      'https://app.witnesswork.app/contacts',
    ])
      expect(shouldForwardToSystem(url)).toBe(true)
  })
})

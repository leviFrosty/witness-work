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
      'witnesswork://shared-good-news',
    ])
      expect(shouldForwardToSystem(url)).toBe(false)
  })

  it('still forwards look-alike hosts', () => {
    expect(
      shouldForwardToSystem('https://ww-proxy.leviwilkerson.com.example.org/b')
    ).toBe(true)
  })
})

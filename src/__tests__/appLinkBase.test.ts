import { afterEach, describe, expect, it, vi } from 'vitest'
import { appLinkBase } from '@/constants/appLinks'
import { setLinksOnNewHost } from '@/__tests__/helpers/appLinkSwitch'

vi.mock(
  '@/constants/appLinkSwitch',
  () => import('@/__tests__/helpers/appLinkSwitch')
)

describe('appLinkBase', () => {
  afterEach(() => setLinksOnNewHost(false))

  it('ships with the switch off', async () => {
    const { CREATE_LINKS_ON_NEW_HOST } = await vi.importActual<
      typeof import('@/constants/appLinkSwitch')
    >('@/constants/appLinkSwitch')
    expect(CREATE_LINKS_ON_NEW_HOST).toBe(false)
  })

  it('makes old-host links until the switch flips', () => {
    expect(appLinkBase('contact')).toBe('https://ww-proxy.leviwilkerson.com/c')
    expect(appLinkBase('buddyInvite')).toBe(
      'https://ww-proxy.leviwilkerson.com/b'
    )
    expect(appLinkBase('handoff')).toBe('https://ww-proxy.leviwilkerson.com/h')
  })

  it('makes apex links with full-word paths once it flips', () => {
    setLinksOnNewHost(true)
    expect(appLinkBase('contact')).toBe('https://witnesswork.app/contacts')
    expect(appLinkBase('buddyInvite')).toBe(
      'https://witnesswork.app/buddies/invite'
    )
    expect(appLinkBase('handoff')).toBe(
      'https://witnesswork.app/accounts/handoff'
    )
  })

  it('takes no host of its own', () => {
    expect(appLinkBase.length).toBe(1)
  })
})

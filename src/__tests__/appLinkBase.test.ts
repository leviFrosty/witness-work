import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_LINK_KINDS, appLinkBase } from '@/constants/appLinks'
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

describe('appLinkBase by build', () => {
  const basesFor = async (variant: string, android = false) => {
    vi.resetModules()
    vi.doUnmock('@/constants/betaBuildEnvironment')
    if (android)
      vi.doMock(
        '@/constants/betaBuildEnvironment',
        () => import('@/constants/betaBuildEnvironment.android')
      )
    vi.stubEnv('EXPO_PUBLIC_APP_VARIANT', variant)
    const links = await import('@/constants/appLinks')
    return APP_LINK_KINDS.map((kind) => links.appLinkBase(kind))
  }
  const BETA_BASES = [
    'https://beta.witnesswork.app/contacts',
    'https://beta.witnesswork.app/buddies/invite',
    'https://beta.witnesswork.app/accounts/handoff',
  ]
  const PRODUCTION_BASES = [
    'https://ww-proxy.leviwilkerson.com/c',
    'https://ww-proxy.leviwilkerson.com/b',
    'https://ww-proxy.leviwilkerson.com/h',
  ]

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('@/constants/betaBuildEnvironment')
  })

  it('makes Beta links with full-word paths in beta and development builds', async () => {
    expect(await basesFor('beta')).toEqual(BETA_BASES)
    expect(await basesFor('development')).toEqual(BETA_BASES)
    expect(await basesFor('development', true)).toEqual(BETA_BASES)
  })

  it('leaves production builds, and an Android beta build, on the switch', async () => {
    expect(await basesFor('production')).toEqual(PRODUCTION_BASES)
    expect(await basesFor('beta', true)).toEqual(PRODUCTION_BASES)
  })
})

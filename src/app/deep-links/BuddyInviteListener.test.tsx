import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Invite links open the pre-accept screen. On the web, a broken one from the
// address opens it too, so the screen can say it isn't valid; phones keep
// ignoring it, as before.

const fake = vi.hoisted(() => ({
  platform: { OS: 'ios' as string },
  launch: null as string | null,
  navigate: vi.fn(),
  opened: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: fake.platform }))
vi.mock('@/lib/launchLinks', () => ({
  launchURL: async () => fake.launch,
  addLinkListener: () => ({ remove: () => {} }),
  linkOpened: fake.opened,
}))
vi.mock('@/features/contacts/lib/linking', () => ({
  navigationRef: { isReady: () => true, navigate: fake.navigate },
}))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => true,
}))
vi.mock('@/hooks/useTakeoverTurn', () => ({
  useIsTakingOver: () => false,
  useTakeoverHold: () => {},
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (
    select: (state: { onboardingComplete: boolean }) => unknown
  ) => select({ onboardingComplete: true }),
}))

const VALID = 'https://witnesswork.app/buddies/invite#1AAECAwQFBgcICQoLDA0ODw'
const BROKEN = 'https://witnesswork.app/buddies/invite#2not-a-version-we-know'

async function open(link: string, os: string) {
  fake.platform.OS = os
  fake.launch = link
  vi.resetModules()
  const { default: BuddyInviteListener } = await import(
    '@/app/deep-links/BuddyInviteListener'
  )
  await act(async () => {
    create(createElement(BuddyInviteListener))
  })
}

beforeEach(() => {
  fake.navigate.mockClear()
  fake.opened.mockClear()
})

describe('BuddyInviteListener', () => {
  it.each(['ios', 'android', 'web'])(
    'opens a valid invite link on %s',
    async (os) => {
      await open(VALID, os)
      expect(fake.navigate).toHaveBeenCalledWith('Buddy Invite', {
        link: VALID,
      })
      expect(fake.opened).toHaveBeenCalledWith(VALID)
    }
  )

  it.each(['ios', 'android'])('ignores a broken one on %s', async (os) => {
    await open(BROKEN, os)
    expect(fake.navigate).not.toHaveBeenCalled()
  })

  it('opens a broken one on the web, where the screen says it isn’t valid', async () => {
    await open(BROKEN, 'web')
    expect(fake.navigate).toHaveBeenCalledWith('Buddy Invite', {
      link: BROKEN,
    })
  })
})

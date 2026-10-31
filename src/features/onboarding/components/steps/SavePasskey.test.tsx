import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  added: true,
  offer: 'offer' as 'offer' | 'has_passkey' | 'unavailable',
}))

vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, children)
  return {
    ActivityIndicator: host('ActivityIndicator'),
    Platform: { OS: 'ios' },
    View: host('View'),
  }
})
vi.mock('lucide-react-native', () => ({ UserRoundKey: 'UserRoundKey' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    numbers: {},
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/features/onboarding/components/Onboarding.styles', () => ({
  styles: {},
}))
vi.mock('@/features/onboarding/components/OnboardingNav', () => ({
  default: () => null,
}))
vi.mock('@/features/onboarding/components/OnboardingFooter', async () => {
  const ReactModule = await import('react')
  return {
    STEP_BOTTOM_PADDING: 0,
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Footer', null, children),
  }
})
vi.mock('@/features/onboarding/components/OnboardingScrollView', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Scroll', null, children),
  }
})
vi.mock('@/components/ui/ActionButton', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      children,
      onPress,
    }: {
      children?: ReactNode
      onPress?: () => void
    }) => ReactModule.createElement('ActionButton', { onPress }, children),
  }
})
vi.mock('@/components/ui/Button', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      children,
      onPress,
    }: {
      children?: ReactNode
      onPress?: () => void
    }) => ReactModule.createElement('Button', { onPress }, children),
  }
})
vi.mock('@/components/ui/InfoPopover', () => ({ default: () => null }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/MyText', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Text', null, children),
  }
})
vi.mock('@/components/ui/layout/ContentColumn', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Column', null, children),
  }
})
vi.mock('@/components/ui/layout/Wrapper', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Wrapper', null, children),
  }
})
vi.mock('@/app/account/passkeyOffer', () => ({
  readPasskeyOffer: vi.fn(async () => runtime.offer),
}))
vi.mock('@/app/account/passkeyPrompt', () => ({
  backOffPasskeyPrompt: vi.fn(),
  stopPasskeyPrompt: vi.fn(),
}))
vi.mock(
  '@/features/settings/components/account/passkeys/passkeyActions',
  () => ({ addPasskeyWithToasts: vi.fn(async () => runtime.added) })
)

import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import {
  backOffPasskeyPrompt,
  stopPasskeyPrompt,
} from '@/app/account/passkeyPrompt'
import SavePasskey from '@/features/onboarding/components/steps/SavePasskey'
import { addPasskeyWithToasts } from '@/features/settings/components/account/passkeys/passkeyActions'
import { analytics } from '@/lib/analytics'

const goNext = vi.fn()
const goBack = vi.fn()
let renderer: ReactTestRenderer | null = null
const render = async (resumed = false) => {
  await act(async () => {
    renderer = create(
      <SavePasskey goBack={goBack} goNext={goNext} resumed={resumed} />
    )
  })
}
const press = async (type: 'ActionButton' | 'Button') =>
  act(async () =>
    renderer!.root
      .find((node) => (node.type as unknown) === type)
      .props.onPress()
  )

beforeEach(() => {
  vi.clearAllMocks()
  runtime.added = true
  runtime.offer = 'offer'
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('SavePasskey', () => {
  it('moves on once a passkey was added, without a second stop or event', async () => {
    await render()
    await press('ActionButton')
    expect(addPasskeyWithToasts).toHaveBeenCalledWith({
      count: 0,
      support: null,
      source: 'onboarding',
    })
    expect(goNext).toHaveBeenCalledTimes(1)
    // Adding stops the gentle prompt itself; onboarding doesn't repeat it.
    expect(stopPasskeyPrompt).not.toHaveBeenCalled()
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('stays on the step when the add is cancelled or fails', async () => {
    runtime.added = false
    await render()
    await press('ActionButton')
    expect(goNext).not.toHaveBeenCalled()
    expect(backOffPasskeyPrompt).not.toHaveBeenCalled()
  })

  it('moves on and holds the gentle prompt back 30 days on Not Now', async () => {
    await render()
    await press('Button')
    expect(addPasskeyWithToasts).not.toHaveBeenCalled()
    expect(backOffPasskeyPrompt).toHaveBeenCalledTimes(1)
    expect(analytics.capture).toHaveBeenCalledTimes(1)
    expect(analytics.capture).toHaveBeenCalledWith('onboarding_step_skipped', {
      step_id: 'passkeys',
    })
    expect(goNext).toHaveBeenCalledTimes(1)
  })

  it('doesn’t ask the account on a first visit', async () => {
    await render()
    expect(readPasskeyOffer).not.toHaveBeenCalled()
  })

  describe('after a relaunch on the step', () => {
    it('moves on, for good, when the account now has a passkey', async () => {
      runtime.offer = 'has_passkey'
      await render(true)
      expect(stopPasskeyPrompt).toHaveBeenCalledTimes(1)
      expect(goNext).toHaveBeenCalledTimes(1)
    })

    it('stays when the account still has none', async () => {
      await render(true)
      expect(readPasskeyOffer).toHaveBeenCalledTimes(1)
      expect(goNext).not.toHaveBeenCalled()
    })

    it('stays when the account can’t be read', async () => {
      runtime.offer = 'unavailable'
      await render(true)
      expect(goNext).not.toHaveBeenCalled()
      expect(stopPasskeyPrompt).not.toHaveBeenCalled()
    })
  })
})

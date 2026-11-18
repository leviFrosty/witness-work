import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  added: true,
  removed: true,
  listFails: false,
  passkeys: [] as { credentialId: string; canUnlock: boolean; name?: string }[],
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
vi.mock('lucide-react-native', () => ({
  UserRoundCheck: 'UserRoundCheck',
  UserRoundKey: 'UserRoundKey',
}))
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
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn() } }))
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
vi.mock('@/components/ui/inputs/Section', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Section', null, children),
  }
})
vi.mock(
  '@/features/settings/components/account/passkeys/PasskeyRow',
  async () => {
    const ReactModule = await import('react')
    return {
      default: (props: object) =>
        ReactModule.createElement('PasskeyRow', props),
    }
  }
)
vi.mock(
  '@/features/settings/components/account/passkeys/RenamePasskeySheet',
  async () => {
    const ReactModule = await import('react')
    return {
      default: (props: object) =>
        ReactModule.createElement('RenamePasskeySheet', props),
    }
  }
)
vi.mock('@/app/account/passkeys', () => ({
  loadPasskeys: vi.fn(async () => {
    if (runtime.listFails) throw new Error('offline')
    return {
      passkeys: [...runtime.passkeys],
      name: 'WitnessWork ABCD',
      readLabel: () => null,
      readName: (credentialId: string, sealed?: string) =>
        sealed ? `${credentialId}:${sealed}` : null,
    }
  }),
}))
vi.mock('@/app/account/passkeyPrompt', () => ({
  backOffPasskeyPrompt: vi.fn(),
  stopPasskeyPrompt: vi.fn(),
}))
vi.mock(
  '@/features/settings/components/account/passkeys/passkeyActions',
  () => ({
    addPasskeyWithToasts: vi.fn(async () => {
      if (runtime.added)
        runtime.passkeys.push({ credentialId: 'new', canUnlock: true })
      return runtime.added
    }),
    letUnlockWithToasts: vi.fn(async () => {}),
    removeWithConfirm: vi.fn(async (passkey: { credentialId: string }) => {
      if (!runtime.removed) return false
      runtime.passkeys = runtime.passkeys.filter(
        (p) => p.credentialId !== passkey.credentialId
      )
      return true
    }),
  })
)

import { loadPasskeys } from '@/app/account/passkeys'
import {
  backOffPasskeyPrompt,
  stopPasskeyPrompt,
} from '@/app/account/passkeyPrompt'
import SavePasskey, {
  forgetRememberedPasskeys,
} from '@/features/onboarding/components/steps/SavePasskey'
import {
  addPasskeyWithToasts,
  removeWithConfirm,
} from '@/features/settings/components/account/passkeys/passkeyActions'
import { analytics } from '@/lib/analytics'

const goNext = vi.fn()
const goBack = vi.fn()
let renderer: ReactTestRenderer | null = null
const render = async () => {
  await act(async () => {
    renderer = create(<SavePasskey goBack={goBack} goNext={goNext} />)
  })
}
const unmount = () => {
  act(() => renderer?.unmount())
  renderer = null
}
const press = async (type: 'ActionButton' | 'Button') =>
  act(async () =>
    renderer!.root
      .find((node) => (node.type as unknown) === type)
      .props.onPress()
  )
const texts = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .flatMap((node) => node.props.children as unknown)
const rows = () =>
  renderer!.root.findAll((node) => (node.type as unknown) === 'PasskeyRow')
const hasButton = (type: 'ActionButton' | 'Button') =>
  renderer!.root.findAll((node) => (node.type as unknown) === type).length > 0

beforeEach(() => {
  vi.clearAllMocks()
  forgetRememberedPasskeys()
  runtime.added = true
  runtime.removed = true
  runtime.listFails = false
  runtime.passkeys = []
})
afterEach(unmount)

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

  it('offers to add on a first visit, when the account has none', async () => {
    await render()
    expect(loadPasskeys).toHaveBeenCalledTimes(1)
    expect(texts()).toContain('onboardingPasskey_title')
    expect(hasButton('Button')).toBe(true)
    expect(stopPasskeyPrompt).not.toHaveBeenCalled()
  })

  it('still offers to add when the account can’t be read', async () => {
    runtime.listFails = true
    await render()
    expect(texts()).toContain('onboardingPasskey_title')
    expect(goNext).not.toHaveBeenCalled()
  })

  describe('coming back after adding one', () => {
    const addThenReturn = async () => {
      await render()
      await press('ActionButton')
      unmount()
      vi.clearAllMocks()
      await render()
    }

    it('shows the passkey with Continue, not a second add', async () => {
      await addThenReturn()
      expect(texts()).toContain('onboardingPasskey_addedTitle')
      expect(rows()).toHaveLength(1)
      expect(hasButton('Button')).toBe(false)

      await press('ActionButton')
      expect(addPasskeyWithToasts).not.toHaveBeenCalled()
      expect(goNext).toHaveBeenCalledTimes(1)
    })

    it('shows it from the first frame, before the account answers', async () => {
      await render()
      await press('ActionButton')
      unmount()
      vi.mocked(loadPasskeys).mockImplementationOnce(
        () => new Promise(() => {})
      )
      await render()
      expect(texts()).toContain('onboardingPasskey_addedTitle')
    })

    it('goes back to the add screen once the passkey is removed', async () => {
      await addThenReturn()
      await act(async () => rows()[0].props.onRemove())
      expect(removeWithConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'new' }),
        [expect.objectContaining({ credentialId: 'new' })]
      )
      expect(texts()).toContain('onboardingPasskey_title')
      expect(rows()).toHaveLength(0)
      expect(goNext).not.toHaveBeenCalled()
    })

    it('renames the passkey, then shows the new name', async () => {
      await addThenReturn()
      const sheet = () =>
        renderer!.root.find(
          (node) => (node.type as unknown) === 'RenamePasskeySheet'
        )
      expect(sheet().props.passkey).toBeNull()
      expect(rows()[0].props.customName).toBeNull()
      await act(async () => rows()[0].props.onRename())
      expect(sheet().props).toMatchObject({
        passkey: { credentialId: 'new', name: null },
        accountName: 'WitnessWork ABCD',
      })

      runtime.passkeys[0].name = 'sealed'
      vi.mocked(loadPasskeys).mockClear()
      await act(async () => sheet().props.onClosed(true))
      expect(loadPasskeys).toHaveBeenCalledTimes(1)
      expect(sheet().props.passkey).toBeNull()
      expect(rows()[0].props.customName).toBe('new:sealed')
    })

    it('leaves the list alone when the rename sheet is dismissed', async () => {
      await addThenReturn()
      await act(async () => rows()[0].props.onRename())
      vi.mocked(loadPasskeys).mockClear()
      await act(async () =>
        renderer!.root
          .find((node) => (node.type as unknown) === 'RenamePasskeySheet')
          .props.onClosed(false)
      )
      expect(loadPasskeys).not.toHaveBeenCalled()
    })

    it('keeps the passkey when the remove is cancelled', async () => {
      runtime.removed = false
      await addThenReturn()
      await act(async () => rows()[0].props.onRemove())
      expect(texts()).toContain('onboardingPasskey_addedTitle')
      expect(rows()).toHaveLength(1)
    })
  })

  it('shows the passkey, and stops the prompt, after a relaunch that closed before moving on', async () => {
    runtime.passkeys = [{ credentialId: 'earlier', canUnlock: true }]
    await render()
    expect(texts()).toContain('onboardingPasskey_addedTitle')
    expect(stopPasskeyPrompt).toHaveBeenCalledTimes(1)
    expect(goNext).not.toHaveBeenCalled()
  })
})

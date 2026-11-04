import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PhonePasskeyOutcome } from '@/app/account/passkeySignIn'

// Sign In with a Passkey's screen: the sheet opens by itself, a passkey that
// can't unlock hands over to the other phone or the recovery key, and failures
// show as a toast over the choices.

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  release: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
  toastError: vi.fn(),
  support: 'supported' as string | null,
  keyChangeStage: null as string | null,
}))
vi.mock('react-native', () => ({ ScrollView: 'ScrollView', View: 'View' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mocks.goBack, replace: mocks.replace }),
  useRoute: () => ({ params: { entry: 'onboarding' } }),
}))
vi.mock('lucide-react-native', () => ({ CircleAlert: 'CircleAlertIcon' }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/app/account/attestationCopy', () => ({
  platformKey: (key: string) => key,
}))
vi.mock('@/components/ui/layout/ContentColumn', () => ({
  default: 'ContentColumn',
}))
vi.mock('@/app/account/keyChange/status', () => ({
  useKeyChangeStatus: (select: (state: { stage: string | null }) => unknown) =>
    select({ stage: mocks.keyChangeStage }),
}))
vi.mock('@/app/account/passkeySignIn', () => ({
  holdPasskeySignIn: () => mocks.release,
  signInWithPhonePasskey: mocks.signIn,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({ onboardingComplete: false }) },
}))
vi.mock('@/stores/toasts', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => true,
}))
vi.mock('@/features/settings/components/account/confirmAccountReplace', () => ({
  confirmAccountReplace: vi.fn(),
}))
vi.mock('@/features/settings/components/account/handoff/HandoffStatus', () => ({
  default: 'HandoffStatus',
}))
vi.mock(
  '@/features/settings/components/account/handoff/SignedInStatus',
  () => ({
    default: 'SignedInStatus',
  })
)
vi.mock(
  '@/features/settings/components/account/passkeySignIn/PasskeySignInChoices',
  () => ({ default: 'PasskeySignInChoices' })
)
vi.mock(
  '@/features/settings/components/account/passkeySignIn/PasskeySignInCantUnlock',
  () => ({ default: 'PasskeySignInCantUnlock' })
)
vi.mock(
  '@/features/settings/components/account/passkeySignIn/passkeySignInCopy',
  () => ({
    passkeySignInFailureText: (reason: string, extra: object) =>
      `${reason}:${JSON.stringify(extra)}`,
  })
)
vi.mock('@/features/settings/components/account/UseRecoveryKeySheet', () => ({
  default: 'UseRecoveryKeySheet',
}))
vi.mock('@/features/settings/hooks/useAttestationSupport', () => ({
  default: () => mocks.support,
}))
vi.mock('@/features/settings/lib/completeOnboardingFromRestore', () => ({
  completeOnboardingFromRestore: vi.fn(),
}))

import SignInWithPasskeyScreen from './SignInWithPasskeyScreen'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.support = 'supported'
  mocks.keyChangeStage = null
})
afterEach(() => vi.useRealTimers())

async function open(result: PhonePasskeyOutcome) {
  mocks.signIn.mockResolvedValue(result)
  let root!: ReactTestRenderer
  await act(async () => {
    root = create(<SignInWithPasskeyScreen />)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  return root
}

const shown = (root: ReactTestRenderer, type: string) =>
  root.root.findAll((node) => (node.type as unknown) === type)

it('opens the passkey sheet by itself, once', async () => {
  const root = await open({ status: 'cancelled', waiting: null })
  expect(mocks.signIn).toHaveBeenCalledTimes(1)
  expect(mocks.signIn).toHaveBeenCalledWith(
    expect.objectContaining({ entry: 'onboarding', buddiesEnabled: true })
  )
  // A closed sheet leaves the choices, with no toast.
  expect(shown(root, 'PasskeySignInChoices')).toHaveLength(1)
  expect(mocks.toastError).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000)
  })
  expect(mocks.signIn).toHaveBeenCalledTimes(1)
})

it("hands a passkey that can't unlock to the other phone or the recovery key", async () => {
  const root = await open({
    status: 'cantUnlock',
    reason: 'noWraps',
    prf: true,
  })
  const [cant] = shown(root, 'PasskeySignInCantUnlock')
  expect(cant.props.prf).toBe(true)
  act(() => cant.props.onOtherPhone())
  expect(mocks.replace).toHaveBeenCalledWith('Sign In With QR Code', {
    entry: 'onboarding',
  })
  act(() => cant.props.onRecoveryKey())
  expect(shown(root, 'UseRecoveryKeySheet')[0].props.open).toBe(true)
})

it('shows a failure as an error toast over the choices', async () => {
  const root = await open({
    status: 'failed',
    reason: 'rate_limited',
    serverReason: null,
    retryAfterMs: 120_000,
    waiting: null,
  })
  expect(mocks.toastError).toHaveBeenCalledWith('handoff_failedTitle', {
    message: expect.stringContaining('rate_limited'),
  })
  expect(mocks.toastError.mock.calls[0][1].message).toContain('120000')
  expect(shown(root, 'PasskeySignInChoices')).toHaveLength(1)
})

it("keeps an unverifiable phone's answer on screen", async () => {
  const root = await open({
    status: 'failed',
    reason: 'unverified',
    serverReason: null,
    retryAfterMs: null,
    waiting: null,
  })
  expect(mocks.toastError).not.toHaveBeenCalled()
  const status = shown(root, 'HandoffStatus')
  expect(status[0].props.testID).toBe('passkey-sign-in-unverified')
})

it("doesn't open the sheet on a phone that can never be verified", async () => {
  mocks.support = 'unsupported'
  const root = await open({ status: 'cancelled', waiting: null })
  expect(mocks.signIn).not.toHaveBeenCalled()
  expect(shown(root, 'HandoffStatus')[0].props.testID).toBe(
    'passkey-sign-in-unverified'
  )
})

it('says when the User declined the replace-key warning', async () => {
  const root = await open({ status: 'declined' })
  expect(shown(root, 'HandoffStatus')[0].props.testID).toBe(
    'passkey-sign-in-declined'
  )
})

it('shows what came over once signed in', async () => {
  const root = await open({
    status: 'done',
    buddiesStarted: false,
    restore: { outcome: 'synced', combine: false },
    rejoined: false,
  })
  const [done] = shown(root, 'SignedInStatus')
  expect(done.props).toMatchObject({
    onboarding: true,
    restore: { outcome: 'synced', combine: false },
    rejoined: false,
    via: 'passkey',
  })
})

it.each([
  { status: 'cancelled' as const },
  {
    status: 'failed' as const,
    reason: 'offline' as const,
    serverReason: null,
    retryAfterMs: null,
  },
])(
  'shows the waiting passkey again when trying another ends $status',
  async (result) => {
    const root = await open({
      ...result,
      waiting: { reason: 'noWraps', prf: true },
    })
    const [cant] = shown(root, 'PasskeySignInCantUnlock')
    expect(cant.props.prf).toBe(true)
    expect(shown(root, 'PasskeySignInChoices')).toHaveLength(0)
  }
)

it('waits for an unfinished key change before opening the sheet', async () => {
  mocks.keyChangeStage = 'pending'
  const root = await open({ status: 'cancelled', waiting: null })
  expect(mocks.signIn).not.toHaveBeenCalled()
  expect(shown(root, 'HandoffStatus')[0].props.testID).toBe(
    'passkey-sign-in-key-change-unfinished'
  )
})

it('lets go of a waiting passkey when the screen goes', async () => {
  const root = await open({ status: 'cantUnlock', reason: 'noPrf', prf: false })
  act(() => root.unmount())
  expect(mocks.release).toHaveBeenCalled()
})

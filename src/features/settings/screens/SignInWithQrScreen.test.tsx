import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ClaimCompletion } from '@/app/account/handoff'
import type { HandoffFailure } from '@/lib/serverAccount/handoffSession'

type Claim = {
  session: object | null
  state: { step: string; reason?: HandoffFailure } | null
  linkProblem: null
  completion: 'idle' | 'running' | ClaimCompletion
  scanned: () => void
  retry?: () => void
  reset: () => void
}

const mocks = vi.hoisted(() => ({
  claim: null as unknown as Claim,
  goBack: vi.fn(),
  retry: vi.fn(),
  reset: vi.fn(),
  buddies: 0,
  onboarded: true,
}))
vi.mock('react-native', () => ({ ScrollView: 'ScrollView', View: 'View' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
  useRoute: () => ({ params: undefined }),
}))
vi.mock('lucide-react-native', () => ({
  CircleCheckBig: 'CircleCheckIcon',
  CircleAlert: 'CircleAlertIcon',
  WifiOff: 'WifiOffIcon',
}))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({ default: () => ({}) }))
vi.mock('@/app/account/attestationCopy', () => ({
  platformKey: (ios: string) => ios,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/settings/components/account/handoff/HandoffCode', () => ({
  default: 'HandoffCode',
}))
vi.mock(
  '@/features/settings/components/account/handoff/HandoffScanPanel',
  () => ({ default: 'HandoffScanPanel' })
)
vi.mock('@/features/settings/components/account/handoff/HandoffStatus', () => ({
  default: 'HandoffStatus',
  HandoffTextButton: 'HandoffTextButton',
}))
vi.mock('@/features/settings/components/account/handoff/handoffCopy', () => ({
  handoffFailureMessage: (role: string, reason: string) => `${role}:${reason}`,
}))
vi.mock('@/features/settings/components/account/UseRecoveryKeySheet', () => ({
  default: 'UseRecoveryKeySheet',
}))
vi.mock('@/features/settings/hooks/useAttestationSupport', () => ({
  default: () => 'supported',
}))
vi.mock('@/features/settings/hooks/useClaimHandoff', () => ({
  default: () => mocks.claim,
}))
vi.mock('@/features/settings/lib/completeOnboardingFromRestore', () => ({
  completeOnboardingFromRestore: vi.fn(),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => ({ onboardingComplete: mocks.onboarded }),
  },
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: (select: (state: { buddies: unknown[] }) => unknown) =>
    select({ buddies: Array.from({ length: mocks.buddies }) }),
}))

import SignInWithQrScreen from './SignInWithQrScreen'
import { BuddyRemovalPendingError } from '@/features/buddies/lib/engine'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'

type Action = { label: string; onPress: () => void; testID?: string }

const actionsOf = async (testID = 'handoff-failed') => {
  let root!: ReturnType<typeof create>
  await act(async () => {
    root = create(<SignInWithQrScreen />)
  })
  const status = root.root
    .findAllByType(HandoffStatus)
    .find((node) => node.props.testID === testID)!
  return {
    body: status.props.body as string,
    primary: status.props.primary as Action | undefined,
    secondary: status.props.secondary as Action | undefined,
  }
}

/** The claim failed while it talked to the other phone. */
const claimFailed = (reason: HandoffFailure): Claim => ({
  session: {},
  state: { step: 'failed', reason },
  linkProblem: null,
  completion: 'idle',
  scanned: vi.fn(),
  reset: mocks.reset,
})

/** The key arrived, then signing in with it failed. */
const completionFailed = (
  reason: HandoffFailure | 'replace_failed'
): Claim => ({
  session: {},
  state: { step: 'failed', reason: 'server' },
  linkProblem: null,
  completion: { outcome: 'failed', reason },
  scanned: vi.fn(),
  reset: mocks.reset,
})

const FINAL: HandoffFailure[] = ['unverified', 'updateRequired']
const RETRYABLE: HandoffFailure[] = [
  'offline',
  'unavailable',
  'expired',
  'used',
  'conflict',
  'cancelled',
  'badToken',
  'tampered',
  'noAccount',
  'verifyLater',
  'rateLimited',
  'server',
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buddies = 0
  mocks.onboarded = true
})

it.each([
  [0, 'handoff_newDoneBodyNoBuddies'],
  [2, 'handoff_newDoneBody'],
])('with %i buddies here, says %s once signed in', async (buddies, body) => {
  mocks.buddies = buddies
  mocks.claim = {
    session: {},
    state: { step: 'done' },
    linkProblem: null,
    completion: {
      outcome: 'done',
      buddiesStarted: buddies > 0,
      restore: { outcome: 'none' },
    } as ClaimCompletion,
    scanned: vi.fn(),
    reset: mocks.reset,
  }
  let root!: ReturnType<typeof create>
  await act(async () => {
    root = create(<SignInWithQrScreen />)
  })
  const done = root.root
    .findAllByType(HandoffStatus)
    .find((node) => node.props.testID === 'handoff-new-done')!
  expect(done.props.body).toBe(body)
})

it.each(FINAL)(
  'offers only Done when the claim fails as %s',
  async (reason) => {
    mocks.claim = claimFailed(reason)
    const { primary, secondary } = await actionsOf()

    expect(primary).toMatchObject({
      label: 'done',
      testID: 'handoff-failed-done',
    })
    expect(secondary).toBeUndefined()
    primary!.onPress()
    expect(mocks.goBack).toHaveBeenCalledTimes(1)
    expect(mocks.reset).not.toHaveBeenCalled()
  }
)

it.each(FINAL)(
  'offers only Done when signing in with the key fails as %s',
  async (reason) => {
    mocks.claim = completionFailed(reason)
    const { primary, secondary } = await actionsOf()

    expect(primary).toMatchObject({
      label: 'done',
      testID: 'handoff-failed-done',
    })
    expect(secondary).toBeUndefined()
    primary!.onPress()
    expect(mocks.goBack).toHaveBeenCalledTimes(1)
    expect(mocks.reset).not.toHaveBeenCalled()
  }
)

it.each(RETRYABLE)(
  'keeps Scan Again and Use a Recovery Key when the claim fails as %s',
  async (reason) => {
    mocks.claim = claimFailed(reason)
    const { primary, secondary } = await actionsOf()

    expect(primary).toMatchObject({
      label: 'handoff_scanAgain',
      testID: 'handoff-scan-again',
    })
    expect(secondary).toMatchObject({
      label: 'handoff_useRecoveryKey',
      testID: 'handoff-use-recovery-key',
    })
    primary!.onPress()
    expect(mocks.reset).toHaveBeenCalledTimes(1)
    expect(mocks.goBack).not.toHaveBeenCalled()
  }
)

it.each<HandoffFailure | 'replace_failed'>([...RETRYABLE, 'replace_failed'])(
  'keeps Scan Again and Use a Recovery Key when signing in fails as %s',
  async (reason) => {
    mocks.claim = completionFailed(reason)
    const { primary, secondary } = await actionsOf()

    expect(primary).toMatchObject({
      label: 'handoff_scanAgain',
      testID: 'handoff-scan-again',
    })
    expect(secondary).toMatchObject({
      label: 'handoff_useRecoveryKey',
      testID: 'handoff-use-recovery-key',
    })
    primary!.onPress()
    expect(mocks.reset).toHaveBeenCalledTimes(1)
    expect(mocks.goBack).not.toHaveBeenCalled()
  }
)

it.each<[HandoffFailure, string]>([
  ['offline', 'new:offline'],
  ['server', 'handoff_signInRetryServer'],
  ['verifyLater', 'new:verifyLater'],
])(
  'offers Try Again with the key still here when signing in fails as %s for now',
  async (reason, body) => {
    mocks.claim = {
      session: {},
      state: { step: 'received' },
      linkProblem: null,
      completion: { outcome: 'failed', reason, retryable: true },
      scanned: vi.fn(),
      retry: mocks.retry,
      reset: mocks.reset,
    }
    const actions = await actionsOf('handoff-failed-retryable')

    expect(actions.body).toBe(body)
    expect(actions.primary).toMatchObject({
      label: 'handoff_tryAgain',
      testID: 'handoff-retry',
    })
    expect(actions.secondary).toMatchObject({ testID: 'handoff-scan-again' })
    actions.primary!.onPress()
    expect(mocks.retry).toHaveBeenCalledTimes(1)
    expect(mocks.reset).not.toHaveBeenCalled()
  }
)

it.each([
  [false, 1],
  [true, 0],
])(
  'a link opened during onboarding (onboarded: %s) finishes it once Cloud Sync brings the data',
  async (onboarded, completions) => {
    mocks.onboarded = onboarded
    mocks.claim = {
      session: {},
      state: { step: 'done' },
      linkProblem: null,
      completion: {
        outcome: 'done',
        buddiesStarted: false,
        restore: { outcome: 'synced', combine: false },
      } as ClaimCompletion,
      scanned: vi.fn(),
      reset: mocks.reset,
    }
    let root!: ReturnType<typeof create>
    await act(async () => {
      root = create(<SignInWithQrScreen />)
    })
    const done = root.root
      .findAllByType(HandoffStatus)
      .find((node) => node.props.testID === 'handoff-new-done')!
    expect(done.props.detail).toBe('handoff_newDoneSynced')
    ;(done.props.primary as Action).onPress()
    expect(completeOnboardingFromRestore).toHaveBeenCalledTimes(completions)
    expect(mocks.goBack).toHaveBeenCalledTimes(1)
  }
)

it.each<[string, BuddyRemovalPendingError | undefined, string]>([
  ['nothing waiting', undefined, 'account_replaceFailedBody'],
  [
    'a buddy',
    new BuddyRemovalPendingError('everything'),
    'buddies_deleteAllPending',
  ],
  [
    'a Shared Car',
    new BuddyRemovalPendingError('everything', ['Mazda CX-5']),
    'buddies_deleteAllCarPending',
  ],
  [
    'several Shared Cars',
    new BuddyRemovalPendingError('everything', ['Mazda CX-5', 'Civic']),
    'buddies_deleteAllCarsPending',
  ],
])(
  'says what Delete Buddies still waits on when replacing the account fails (%s)',
  async (_case, removalPending, body) => {
    mocks.claim = {
      ...completionFailed('replace_failed'),
      completion: {
        outcome: 'failed',
        reason: 'replace_failed',
        ...(removalPending && { removalPending }),
      },
    }
    expect((await actionsOf()).body).toBe(body)
  }
)

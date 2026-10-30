import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'
import type { OfferStartProblem } from '@/app/account/handoff'
import type { HandoffFailure } from '@/lib/serverAccount/handoffSession'

type Offer = {
  start:
    | { phase: 'starting' }
    | { phase: 'problem'; problem: OfferStartProblem }
    | { phase: 'ready'; session: object }
  session: object | null
  state: { step: string; reason?: HandoffFailure } | null
  newCode: () => void
}

const mocks = vi.hoisted(() => ({
  offer: null as unknown as Offer,
  goBack: vi.fn(),
  newCode: vi.fn(),
  buddies: 0,
}))
vi.mock('react-native', () => ({ ScrollView: 'ScrollView' }))
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
vi.mock('@/app/account/attestationCopy', () => ({
  platformKey: (ios: string) => ios,
}))
vi.mock('@/app/account/handoff', () => ({ approveHandoff: vi.fn() }))
vi.mock('@/lib/deviceOwner', () => ({ confirmDeviceOwner: vi.fn() }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/toasts', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock(
  '@/features/settings/components/account/handoff/HandoffQrPanel',
  () => ({ default: 'HandoffQrPanel' })
)
vi.mock(
  '@/features/settings/components/account/handoff/HandoffApproval',
  () => ({ default: 'HandoffApproval' })
)
vi.mock('@/features/settings/components/account/handoff/HandoffStatus', () => ({
  default: 'HandoffStatus',
}))
vi.mock('@/features/settings/components/account/handoff/handoffCopy', () => ({
  handoffFailureMessage: (role: string, reason: string) => `${role}:${reason}`,
}))
vi.mock('@/features/settings/hooks/useOfferHandoff', () => ({
  default: () => mocks.offer,
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: (select: (state: { buddies: unknown[] }) => unknown) =>
    select({ buddies: Array.from({ length: mocks.buddies }) }),
}))

import SetUpAnotherDeviceScreen from './SetUpAnotherDeviceScreen'
import HandoffStatus from '@/features/settings/components/account/handoff/HandoffStatus'

type Action = { label: string; onPress: () => void; testID?: string }

const primaryOf = async (testID: string): Promise<Action | undefined> => {
  let root!: ReturnType<typeof create>
  await act(async () => {
    root = create(<SetUpAnotherDeviceScreen />)
  })
  const status = root.root
    .findAllByType(HandoffStatus)
    .find((node) => node.props.testID === testID)!
  return status.props.primary as Action | undefined
}

const failed = (reason: HandoffFailure): Offer => ({
  start: { phase: 'ready', session: {} },
  session: {},
  state: { step: 'failed', reason },
  newCode: mocks.newCode,
})

const problem = (problem: OfferStartProblem): Offer => ({
  start: { phase: 'problem', problem },
  session: null,
  state: null,
  newCode: mocks.newCode,
})

beforeEach(() => {
  vi.clearAllMocks()
})

it.each<HandoffFailure>(['unverified', 'updateRequired'])(
  'offers Done instead of a new code when a handoff fails as %s',
  async (reason) => {
    mocks.offer = failed(reason)
    const primary = await primaryOf('handoff-failed')

    expect(primary).toMatchObject({
      label: 'done',
      testID: 'handoff-failed-done',
    })
    primary!.onPress()
    expect(mocks.goBack).toHaveBeenCalledTimes(1)
    expect(mocks.newCode).not.toHaveBeenCalled()
  }
)

it.each<HandoffFailure>([
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
])('keeps Make a New Code when a handoff fails as %s', async (reason) => {
  mocks.offer = failed(reason)
  const primary = await primaryOf('handoff-failed')

  expect(primary).toMatchObject({
    label: 'handoff_newCode',
    testID: 'handoff-new-code',
  })
  primary!.onPress()
  expect(mocks.newCode).toHaveBeenCalledTimes(1)
  expect(mocks.goBack).not.toHaveBeenCalled()
})

it.each<OfferStartProblem>(['unsupported', 'unverified', 'updateRequired'])(
  'offers Done when the handoff can never start (%s)',
  async (reason) => {
    mocks.offer = problem(reason)
    const primary = await primaryOf('handoff-problem')

    expect(primary).toMatchObject({
      label: 'done',
      testID: 'handoff-problem-done',
    })
    primary!.onPress()
    expect(mocks.goBack).toHaveBeenCalledTimes(1)
  }
)

it.each<OfferStartProblem>(['unavailable', 'verifyLater', 'offline'])(
  'offers Try Again when the handoff can start later (%s)',
  async (reason) => {
    mocks.offer = problem(reason)
    const primary = await primaryOf('handoff-problem')

    expect(primary).toMatchObject({
      label: 'handoff_tryAgain',
      testID: 'handoff-try-again',
    })
    primary!.onPress()
    expect(mocks.newCode).toHaveBeenCalledTimes(1)
  }
)

it.each([
  [0, 'handoff_oldDoneBodyNoBuddies'],
  [2, 'handoff_oldDoneBody'],
])(
  'with %i buddies, says %s once the other phone is in',
  async (buddies, body) => {
    mocks.buddies = buddies
    mocks.offer = {
      start: { phase: 'ready', session: {} },
      session: {},
      state: {
        step: 'done',
        hello: { deviceName: 'Pixel 9' },
      } as Offer['state'],
      newCode: mocks.newCode,
    }
    let root!: ReturnType<typeof create>
    await act(async () => {
      root = create(<SetUpAnotherDeviceScreen />)
    })
    const done = root.root
      .findAllByType(HandoffStatus)
      .find((node) => node.props.testID === 'handoff-old-done')!
    expect(done.props.body).toBe(body)
  }
)

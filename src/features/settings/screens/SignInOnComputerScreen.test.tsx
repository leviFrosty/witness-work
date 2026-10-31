import React from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'
import type { PhoneApprovalState } from '@/lib/serverAccount/approvalSession'

type Approve = {
  start: { phase: 'scanning' | 'starting' | 'ready' }
  session: object | null
  state: PhoneApprovalState | null
}

const mocks = vi.hoisted(() => ({
  approve: null as unknown as Approve,
  params: undefined as { link?: string } | undefined,
  hookArgs: [] as unknown[],
  goBack: vi.fn(),
  scan: vi.fn(),
  scanAgain: vi.fn(),
  retry: vi.fn(),
  approveBrowser: vi.fn(),
  confirmDeviceOwner: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('react-native', () => ({ ScrollView: 'ScrollView', View: 'View' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
  useRoute: () => ({ params: mocks.params }),
}))
vi.mock('lucide-react-native', () => ({
  CircleCheckBig: 'CircleCheckIcon',
  CircleAlert: 'CircleAlertIcon',
  WifiOff: 'WifiOffIcon',
}))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/components/ui/layout/FoldPane', () => ({
  useFoldColumn: () => null,
}))
vi.mock('@/app/account/approval', () => ({
  approveBrowser: mocks.approveBrowser,
}))
vi.mock('@/app/account/attestationCopy', () => ({
  platformKey: (ios: string) => ios,
}))
vi.mock('@/lib/deviceOwner', () => ({
  confirmDeviceOwner: mocks.confirmDeviceOwner,
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/serverAccount/approvalRuntime', () => ({
  appApprovalOrigins: () => ['https://app.witnesswork.app'],
}))
vi.mock('@/stores/toasts', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: object) =>
      options ? `${key}${JSON.stringify(options)}` : key,
  },
}))
vi.mock(
  '@/features/settings/components/account/approval/BrowserApproval',
  () => ({ default: 'BrowserApproval' })
)
vi.mock('@/features/settings/components/account/handoff/HandoffStatus', () => ({
  default: 'HandoffStatus',
}))
vi.mock('@/features/settings/components/account/handoff/QrScanPanel', () => ({
  default: 'QrScanPanel',
}))
vi.mock('@/features/settings/hooks/useApproveBrowser', () => ({
  default: (...args: unknown[]) => {
    mocks.hookArgs = args
    return {
      ...mocks.approve,
      scan: mocks.scan,
      scanAgain: mocks.scanAgain,
      retry: mocks.retry,
      host: 'app.witnesswork.app',
    }
  },
}))

import SignInOnComputerScreen from './SignInOnComputerScreen'

const HELLO = { browser: 'Chrome', system: 'macOS', appVersion: '3.0.0' }
const ready = (state: PhoneApprovalState): Approve => ({
  start: { phase: 'ready' },
  session: { approve: vi.fn() },
  state,
})

async function render() {
  let root!: ReturnType<typeof create>
  await act(async () => {
    root = create(<SignInOnComputerScreen />)
  })
  return root.root
}

const byTestID = async (type: string, testID: string) =>
  (await render())
    .findAllByType(type as never)
    .find((node) => node.props.testID === testID)!

beforeEach(() => {
  vi.clearAllMocks()
  mocks.params = undefined
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = true
})

it('takes only approval codes from its scanner', async () => {
  mocks.approve = { start: { phase: 'scanning' }, session: null, state: null }
  const scanner = (await render()).findByType('QrScanPanel' as never)
  expect(scanner.props.read('https://evil.example/approve#1abc')).toBe(
    'approval_scanWrongHost'
  )
  expect(scanner.props.read('hello')).toBe('approval_scanNotApproval')
  expect(mocks.scan).not.toHaveBeenCalled()
  const link = `https://app.witnesswork.app/approve#1${'A'.repeat(21)}Q${'B'.repeat(64)}`
  expect(scanner.props.read(link)).toBeNull()
  expect(mocks.scan).toHaveBeenCalledWith(link)
})

it('takes a handed-in code only in a development build', async () => {
  mocks.approve = { start: { phase: 'scanning' }, session: null, state: null }
  mocks.params = { link: 'https://app.witnesswork.app/approve#1x' }
  await render()
  expect(mocks.hookArgs).toEqual(['settings', mocks.params.link])
  ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  await render()
  expect(mocks.hookArgs).toEqual(['settings', undefined])
})

it('asks the device’s owner before YES sends, and says when it couldn’t', async () => {
  mocks.approve = ready({
    step: 'confirm',
    hello: HELLO,
    far: true,
    code: '123456',
    expiresAt: 1,
  })
  mocks.approveBrowser.mockImplementation(
    async (_session, { confirmOwner }) => {
      await confirmOwner()
      return 'failed'
    }
  )
  const prompt = (await render()).findByType('BrowserApproval' as never)
  expect(prompt.props).toMatchObject({
    host: 'app.witnesswork.app',
    sending: false,
  })
  await act(async () => prompt.props.onAllow())
  expect(mocks.approveBrowser).toHaveBeenCalledWith(mocks.approve.session, {
    confirmOwner: expect.any(Function),
  })
  expect(mocks.confirmDeviceOwner).toHaveBeenCalledWith('approval_unlockPrompt')
  expect(mocks.toastError).toHaveBeenCalledWith('approval_unlockFailed')
})

it('goes back to the scanner after a failure', async () => {
  mocks.approve = ready({ step: 'failed', reason: 'expired' })
  const ended = await byTestID('HandoffStatus', 'approval-ended')
  expect(ended.props).toMatchObject({
    title: 'approval_failedTitle',
    body: 'approval_failExpired',
  })
  ended.props.primary.onPress()
  expect(mocks.scanAgain).toHaveBeenCalledTimes(1)
})

it('says Approved once the key is sent', async () => {
  mocks.approve = ready({ step: 'done', hello: HELLO })
  const approved = await byTestID('HandoffStatus', 'approval-approved')
  expect(approved.props.title).toBe('approval_doneTitle')
  approved.props.primary.onPress()
  expect(mocks.goBack).toHaveBeenCalledTimes(1)
})

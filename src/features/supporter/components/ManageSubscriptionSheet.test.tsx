import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    platform: 'ios' as 'ios' | 'android',
    hook: {} as Record<string, unknown>,
    pause: vi.fn(),
    openStore: vi.fn(),
  }
})
vi.mock('react-native', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => children,
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  View: 'View',
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
}))
vi.mock('tamagui', () => {
  const Sheet = ({ children }: { children: React.ReactNode }) => children
  Sheet.Handle = 'SheetHandle'
  Sheet.Overlay = 'SheetOverlay'
  Sheet.Frame = 'SheetFrame'
  return { Sheet }
})
vi.mock('@/components/ui/Spinner', () => ({ default: 'Spinner' }))
vi.mock('@/components/ui/InlineNotice', () => ({ default: 'InlineNotice' }))
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, numbers: {}, fontSize: () => 14 }),
}))
vi.mock('@/hooks/useSheetBottomInset', () => ({ default: () => 0 }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/layout/XView', () => ({ default: 'XView' }))
vi.mock('@/components/ui/inputs/InputLayout', () => ({
  inputLayout: { contentMaxWidth: 680 },
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatDate: (date: Date | string) =>
    new Date(date).toISOString().slice(0, 10),
}))
vi.mock('@/features/supporter/hooks/useManageSubscription', () => ({
  get storePlatform() {
    return runtime.platform
  },
  default: () => ({
    pausingMonths: null,
    productLoaded: true,
    pause: runtime.pause,
    openStore: runtime.openStore,
    ...runtime.hook,
  }),
}))

const sub = { productIdentifier: 'jwtime_499_1mo', expiresDate: '2026-11-01' }
const offer = (months: number) => ({
  months,
  discount: { identifier: `${months}` },
})

let tree: ReactTestRenderer
const render = async () => {
  const { default: ManageSubscriptionSheet } = await import(
    '@/features/supporter/components/ManageSubscriptionSheet'
  )
  await act(async () => {
    tree = create(
      <ManageSubscriptionSheet open setOpen={() => {}} source='settings' />
    )
  })
}
const texts = () =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => node.props.children)
    .flat()
    .filter((child): child is string => typeof child === 'string')
const footer = () =>
  tree.root.find(
    (node) =>
      (node.type as unknown) === 'Button' && node.props.variant === 'outline'
  )

describe('ManageSubscriptionSheet', () => {
  beforeEach(() => {
    vi.resetModules()
    runtime.platform = 'ios'
  })
  afterEach(() => vi.clearAllMocks())

  it('offers each App Store pause with its next payment date', async () => {
    runtime.hook = {
      state: {
        kind: 'renewing',
        sub,
        renewsAt: new Date(sub.expiresDate),
        pause: { kind: 'offers', offers: [offer(1), offer(3), offer(6)] },
      },
    }
    await render()
    expect(texts()).toEqual(
      expect.arrayContaining([
        'manageSupport_pauseTitle',
        'manageSupport_pauseFor {"count":3}',
        'manageSupport_nextPayment {"date":"2027-02-01"}',
        'manageSupport_cancelOrChange',
        'manageSupport_storeHint',
      ])
    )
    const options = tree.root.findAll(
      (node) =>
        node.props.title?.startsWith?.('manageSupport_pauseFor') ?? false
    )
    expect(options).toHaveLength(3)
    await act(async () => options[1].props.onPress())
    expect(runtime.pause).toHaveBeenCalledWith(offer(3))
  })

  it('always keeps the store button one tap away', async () => {
    for (const state of [
      { kind: 'none' },
      {
        kind: 'ending',
        sub,
        endsAt: new Date(sub.expiresDate),
      },
      { kind: 'paused', sub, resumesAt: new Date('2027-02-01') },
      {
        kind: 'renewing',
        sub,
        renewsAt: null,
        pause: { kind: 'unavailable', reason: 'no_offers' },
      },
    ]) {
      runtime.hook = { state }
      await render()
      expect(footer().props.disabled).toBe(false)
    }
  })

  it('offers a retry when the pause options failed to load', async () => {
    const retryProduct = vi.fn()
    runtime.hook = {
      productError: 'offline',
      retryProduct,
      state: {
        kind: 'renewing',
        sub,
        renewsAt: new Date(sub.expiresDate),
        pause: { kind: 'unavailable', reason: 'no_offers' },
      },
    }
    await render()
    const notice = tree.root.findByType('InlineNotice' as never)
    expect(notice.props).toMatchObject({
      tone: 'offline',
      message: 'manageSupport_pauseLoadFailed',
    })
    notice.props.onRetry()
    expect(retryProduct).toHaveBeenCalledOnce()
    expect(footer().props.disabled).toBe(false)
  })

  it('hands Android pauses to Google Play with its own wording', async () => {
    runtime.platform = 'android'
    runtime.hook = {
      state: {
        kind: 'renewing',
        sub,
        renewsAt: new Date(sub.expiresDate),
        pause: { kind: 'play' },
      },
    }
    await render()
    expect(texts()).toEqual(
      expect.arrayContaining([
        'manageSupport_pauseTitleAndroid',
        'manageSupport_pauseDescriptionAndroid',
        'manageSupport_storeHintAndroid',
      ])
    )
    expect(texts()).not.toContain('manageSupport_storeHint')
    const playOption = tree.root.find(
      (node) => node.props.title === 'manageSupport_playPause'
    )
    expect(playOption.props.detail).toBe('manageSupport_playPauseDetail')
  })

  it('tells a Supporter when they can pause again', async () => {
    runtime.hook = {
      state: {
        kind: 'renewing',
        sub,
        renewsAt: new Date(sub.expiresDate),
        pause: {
          kind: 'unavailable',
          reason: 'cooldown',
          availableAgainAt: new Date('2027-03-01'),
        },
      },
    }
    await render()
    expect(texts()).toContain(
      'manageSupport_pauseAgainAfter {"date":"2027-03-01"}'
    )
    expect(
      tree.root.findAll(
        (node) => node.props.title?.startsWith?.('manage') ?? false
      )
    ).toHaveLength(0)
  })

  it('disables the store button while the App Store sheet is up', async () => {
    runtime.hook = {
      pausingMonths: 3,
      state: {
        kind: 'renewing',
        sub,
        renewsAt: new Date(sub.expiresDate),
        pause: { kind: 'offers', offers: [offer(3)] },
      },
    }
    await render()
    expect(footer().props.disabled).toBe(true)
  })
})

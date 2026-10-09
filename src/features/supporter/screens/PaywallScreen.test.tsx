import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    platform: 'ios',
    params: {} as Record<string, unknown>,
    capture: vi.fn(),
    purchase: vi.fn(),
    getOfferings: vi.fn(),
    revalidate: vi.fn(),
    replace: vi.fn(),
    alert: vi.fn(),
    captureException: vi.fn(),
    foreground: new Set<() => void>(),
    reconnect: new Set<() => void>(),
    beforeRemove: undefined as (() => void) | undefined,
  }
})
vi.mock('react-native', () => ({
  Alert: { alert: runtime.alert },
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  ScrollView: 'ScrollView',
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: 800, fontScale: 1 }),
}))
vi.mock('lucide-react-native', () => ({
  ChevronDown: 'ChevronDown',
  CircleAlert: 'CircleAlert',
  CircleQuestionMark: 'CircleQuestionMark',
  PackageOpen: 'PackageOpen',
  RotateCw: 'RotateCw',
  Trash2: 'Trash2',
  WifiOff: 'WifiOff',
}))
vi.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: runtime.params }),
  useNavigation: () => ({
    setOptions: () => {},
    replace: runtime.replace,
    addListener: (_event: string, callback: () => void) => {
      runtime.beforeRemove = callback
      return () => {}
    },
  }),
}))
vi.mock('react-native-purchases', () => ({
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: 'cancelled',
    PAYMENT_PENDING_ERROR: 'pending',
  },
  default: {
    getOfferings: runtime.getOfferings,
    purchasePackage: runtime.purchase,
  },
}))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({
    ready: true,
    customer: null,
    hasPurchasedBefore: false,
    revalidate: runtime.revalidate,
  }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, numbers: {}, fontSize: () => 14 }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => ({
  logger: { log: () => {}, warn: () => {}, error: () => {} },
}))
vi.mock('@/lib/offlineError', () => ({ isOfflineError: () => false }))
vi.mock('@/lib/account', () => ({ clearAdoptedAccountId: () => {} }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    runtime.foreground.add(listener)
    return { remove: () => runtime.foreground.delete(listener) }
  },
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: (listener: () => void) => {
    runtime.reconnect.add(listener)
    return { remove: () => runtime.reconnect.delete(listener) }
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/components/ui/Spinner', () => ({ default: 'Spinner' }))
vi.mock('@/components/ui/Empty', () => ({ default: 'Empty' }))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/InlineNotice', () => ({ default: 'InlineNotice' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/Divider', () => ({ default: 'Divider' }))
vi.mock('@/components/ui/layout/Header', () => ({ default: 'Header' }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/components/ui/layout/XView', () => ({ default: 'XView' }))
vi.mock('@/components/ui/SegmentedControl', () => ({
  default: 'SegmentedControl',
}))
vi.mock('@/features/supporter/components/PreviousDonations', () => ({
  default: 'PreviousDonations',
}))
vi.mock('@/features/supporter/components/PaywallBenefits', () => ({
  FounderLetter: 'FounderLetter',
  SocialProofRow: 'SocialProofRow',
  ComparisonChart: 'ComparisonChart',
}))
vi.mock('@/features/supporter/components/PaywallOptions', () => ({
  TierSwitchCard: 'TierSwitchCard',
  PriceOption: 'PriceOption',
  DevPillButton: 'DevPillButton',
  AllOptionsSheet: 'AllOptionsSheet',
}))
vi.mock('@/features/supporter/components/PaywallPurchaseFooter', () => ({
  default: 'PaywallPurchaseFooter',
  PaywallLegalFooter: 'PaywallLegalFooter',
}))

import PaywallScreen from '@/features/supporter/screens/PaywallScreen'
import PaywallPurchaseFooter from '@/features/supporter/components/PaywallPurchaseFooter'
import { TierSwitchCard } from '@/features/supporter/components/PaywallOptions'

const attribution = {
  feature: 'customAccentColor',
  source_screen: 'Contact Form',
  gate_surface: 'avatar_background',
  gate_placement: 'customAccentColor / Contact Form / avatar_background',
  gate_flow_id: 'gate-visit-123',
}
const pkg = (id: string) => ({
  identifier: id,
  offeringIdentifier: id,
  product: {
    identifier: id,
    price: 10,
    priceString: '$10',
    currencyCode: 'USD',
  },
})
let renderer: ReactTestRenderer | undefined
const events = (name: string) =>
  runtime.capture.mock.calls.filter(([event]) => event === name)
const render = async () => {
  await act(async () => {
    renderer = create(<PaywallScreen />)
  })
}
const purchase = async () => {
  await act(async () => {
    await renderer!.root.findByType(PaywallPurchaseFooter).props.onPurchase()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__DEV__', false)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  runtime.platform = 'ios'
  runtime.params = {
    source: 'feature_gate',
    feature: attribution.feature,
    gateAttribution: attribution,
  }
  runtime.beforeRemove = undefined
  runtime.foreground.clear()
  runtime.reconnect.clear()
  runtime.purchase.mockResolvedValue({ productIdentifier: 'annual' })
  const annual = pkg('annual')
  const tip = pkg('tip')
  runtime.getOfferings.mockResolvedValue({
    current: null,
    all: {
      supporter: {
        identifier: 'supporter',
        annual,
        availablePackages: [annual],
      },
      tip: { identifier: 'tip', availablePackages: [tip] },
    },
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
})

describe.each(['ios', 'android'])('purchase attribution on %s', (platform) => {
  it('keeps the original feature and screen through checkout success and screen close', async () => {
    runtime.platform = platform
    await render()
    expect(events('paywall_viewed')[0][1]).toMatchObject(attribution)
    await purchase()
    expect(events('supporter_purchase_started')[0][1]).toMatchObject({
      ...attribution,
      tier: 'supporter',
    })
    expect(events('supporter_purchase_completed')[0][1]).toEqual(
      events('supporter_purchase_started')[0][1]
    )
    act(() => runtime.beforeRemove?.())
    expect(events('paywall_closed')[0][1]).toMatchObject({
      ...attribution,
      purchased: true,
    })
    expect(runtime.replace).toHaveBeenCalledExactlyOnceWith('Thank You', {
      purchaseTier: 'supporter',
    })
  })
})

it.each([
  ['cancelled', 'supporter_purchase_cancelled'],
  ['network', 'supporter_purchase_failed'],
])(
  'attributes a %s outcome to the gate without counting a conversion',
  async (code, event) => {
    runtime.purchase.mockRejectedValue({ code })
    await render()
    await purchase()
    expect(events(event)[0][1]).toMatchObject({
      ...attribution,
      error_code: code,
      tier: 'supporter',
    })
    expect(events('supporter_purchase_completed')).toHaveLength(0)
    expect(runtime.replace).not.toHaveBeenCalled()
  }
)

it('marks a one-time tip distinctly so it can be excluded from supporter conversion', async () => {
  await render()
  act(() => renderer!.root.findByType(TierSwitchCard).props.onPress())
  await purchase()
  expect(events('supporter_purchase_completed')[0][1]).toMatchObject({
    ...attribution,
    tier: 'tip',
  })
})

it('does not reuse feature-gate attribution when the paywall opens from settings', async () => {
  runtime.params = { source: 'settings' }
  await render()
  await purchase()
  const properties = events('supporter_purchase_completed')[0][1]
  expect(properties.source).toBe('settings')
  expect(properties.gate_flow_id).toBeUndefined()
  expect(properties.source_screen).toBeUndefined()
})

describe('offerings', () => {
  const empty = () => renderer!.root.findAllByType('Empty' as never)
  const tryAgain = async () => {
    await act(async () => {
      empty()[0].props.action.props.onPress()
    })
  }

  it('shows a failure with Try Again instead of spinning forever', async () => {
    const offerings = await runtime.getOfferings()
    runtime.getOfferings.mockRejectedValueOnce({ code: '2', message: 'nope' })
    await render()
    expect(empty()[0].props.title).toBe('errorFetchingOfferings')
    expect(runtime.alert).not.toHaveBeenCalled()
    expect(runtime.captureException).toHaveBeenCalledOnce()
    expect(events('paywall_offerings_failed')[0][1]).toMatchObject({
      ...attribution,
      trigger: 'initial',
    })

    runtime.getOfferings.mockResolvedValueOnce(offerings)
    await tryAgain()
    expect(empty()).toHaveLength(0)
    expect(renderer!.root.findAllByType(PaywallPurchaseFooter)).toHaveLength(1)
  })

  it('says when the device is offline, without reporting it', async () => {
    runtime.getOfferings.mockRejectedValueOnce(
      new Error('The Internet connection appears to be offline.')
    )
    await render()
    expect(empty()[0].props).toMatchObject({
      title: 'common_offlineTitle',
      description: 'paywall_offline',
    })
    expect(runtime.captureException).not.toHaveBeenCalled()
  })

  it.each([
    ['foreground', runtime.foreground],
    ['reconnect', runtime.reconnect],
  ])('loads again on %s after a failure', async (trigger, listeners) => {
    runtime.getOfferings.mockRejectedValueOnce(new Error('network error'))
    await render()
    expect(listeners.size).toBe(1)
    await act(async () => listeners.forEach((listener) => listener()))
    expect(runtime.getOfferings).toHaveBeenCalledTimes(2)
    expect(empty()).toHaveLength(0)
    // Loaded: nothing left to retry.
    expect(listeners.size).toBe(0)
    expect(events('paywall_offerings_failed')[0][1].trigger).toBe('initial')
    expect(trigger).toBeTruthy()
  })

  it('explains an empty store instead of showing no prices', async () => {
    runtime.getOfferings.mockResolvedValueOnce({ current: null, all: {} })
    await render()
    expect(empty()[0].props).toMatchObject({
      title: 'paywall_noOptionsTitle',
      description: 'thereAreNoOfferings',
    })
    expect(events('paywall_offerings_empty')).toHaveLength(1)
  })
})

describe('purchase in flight', () => {
  it('ignores presses until the store answers and shows progress', async () => {
    let finish: (value: { productIdentifier: string }) => void = () => {}
    runtime.purchase.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    await render()
    const footer = () => renderer!.root.findByType(PaywallPurchaseFooter)
    await act(async () => {
      void footer().props.onPurchase()
    })
    expect(footer().props.purchasing).toBe(true)
    await act(async () => {
      void footer().props.onPurchase()
    })
    expect(runtime.purchase).toHaveBeenCalledOnce()
    await act(async () => finish({ productIdentifier: 'annual' }))
    expect(footer().props.purchasing).toBe(false)
  })

  it('treats Ask to Buy as waiting for approval, not an error', async () => {
    runtime.purchase.mockRejectedValue({ code: 'pending' })
    await render()
    await purchase()
    expect(runtime.alert).toHaveBeenCalledWith(
      'storeError_pendingTitle',
      'storeError_pending',
      undefined
    )
    expect(runtime.captureException).not.toHaveBeenCalled()
  })
})

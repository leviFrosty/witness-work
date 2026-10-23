import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScribeUsage, ScribeUsageState } from '@/features/scribe/types'

const runtime = vi.hoisted(() => ({
  state: null as unknown as ScribeUsageState,
  navigate: vi.fn(),
  capture: vi.fn(),
  knownSupporter: false,
  recheck: vi.fn(async () => true),
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  View: 'View',
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: runtime.navigate }),
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'Font' }),
    fontSize: () => 14,
    numbers: { borderRadiusLg: 16 },
  }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/scribe', () => ({
  useScribeUsage: () => runtime.state,
}))
vi.mock('@/features/scribe/components/ScribeUsageWindowRow', () => ({
  default: 'ScribeUsageWindowRow',
}))
vi.mock('lucide-react-native', () => ({}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/lib/storeListing', () => ({ openStoreListing: vi.fn() }))
vi.mock('@/stores/supporterStatus', () => ({
  useSupporter: (pick: (state: { isSupporter: boolean }) => unknown) =>
    pick({ isSupporter: runtime.knownSupporter }),
}))
vi.mock('@/features/scribe/runtime/status', () => ({
  recheckSupporter: runtime.recheck,
}))

import ScribeUsageScreen from '@/features/scribe/screens/ScribeUsageScreen'

const usage = (overrides: Partial<ScribeUsage> = {}): ScribeUsage => ({
  plan: 'free',
  windows: [{ id: 'monthly', percentUsed: 37, resetsAt: 1 }],
  limited: false,
  resetsAt: null,
  supporterCheckFailed: false,
  asOf: 0,
  ...overrides,
})

const setState = (overrides: Partial<ScribeUsageState>) => {
  runtime.state = {
    usage: null,
    loading: false,
    failed: false,
    refresh: vi.fn(),
    ...overrides,
  }
}

const render = () => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeUsageScreen />)
  })
  const find = (type: string) =>
    renderer.root.findAll((node) => node.type === type)
  const texts = () =>
    find('Text')
      .flatMap((node) => node.children)
      .filter((child): child is string => typeof child === 'string')
  return { renderer, find, texts }
}

describe('ScribeUsageScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.knownSupporter = false
  })

  it('waits for usage, then says when it can’t be read', () => {
    setState({ loading: true })
    expect(render().find('ActivityIndicator')).toHaveLength(1)

    setState({ failed: true })
    expect(render().texts()).toEqual(['scribe_usageUnavailable'])
    expect(runtime.capture).not.toHaveBeenCalled()
  })

  it('shows the free plan, each window and the upsell', () => {
    setState({ usage: usage() })
    const { find, texts } = render()
    expect(texts()).toEqual([
      'scribe_usagePlanFree',
      'scribe_limitUpsell',
      'scribe_becomeSupporter',
    ])
    expect(find('ScribeUsageWindowRow').map((n) => n.props.window.id)).toEqual([
      'monthly',
    ])
    expect(runtime.capture).toHaveBeenCalledWith('scribe_usage_viewed', {
      surface: 'settings',
      plan: 'free',
      limited: false,
    })

    act(() => find('Button')[0].props.onPress())
    expect(runtime.capture).toHaveBeenLastCalledWith('scribe_upsell_tapped', {
      surface: 'usage',
    })
    expect(runtime.navigate).toHaveBeenCalledWith('Paywall', {
      initialTier: 'supporter',
      source: 'scribe_usage',
    })
  })

  it('shows a Supporter’s windows without an upsell', () => {
    setState({
      usage: usage({
        plan: 'supporter',
        windows: [
          { id: 'session', percentUsed: 12, resetsAt: 1 },
          { id: 'weekly', percentUsed: 0, resetsAt: null },
        ],
      }),
    })
    const { find, texts } = render()
    expect(texts()).toEqual(['scribe_usagePlanSupporter'])
    expect(find('ScribeUsageWindowRow')).toHaveLength(2)
    expect(find('Button')).toHaveLength(0)
  })

  it('says when it shows the last usage it read', () => {
    setState({ usage: usage(), failed: true })
    expect(render().texts()).toContain('scribe_usageStale')
  })

  it('says when Supporter status couldn’t be checked, without the upsell', () => {
    setState({ usage: usage({ supporterCheckFailed: true }) })
    const { find, texts } = render()
    expect(texts()).toEqual([
      'scribe_usagePlanFree',
      'scribe_usageSupporterCheckFailed',
    ])
    expect(find('Button')).toHaveLength(0)
  })

  it('offers Check again, not the upsell, to a Supporter metered as free', async () => {
    runtime.knownSupporter = true
    setState({ usage: usage() })
    const { find, texts } = render()
    expect(texts()).toEqual([
      'scribe_usagePlanFree',
      'scribe_supporterNotSeen',
      'scribe_supporterCheckAgain',
    ])
    await act(async () => find('Button')[0].props.onPress())
    expect(runtime.recheck).toHaveBeenCalledTimes(1)
    expect(runtime.capture).toHaveBeenCalledWith('scribe_supporter_rechecked', {
      supporter: true,
    })
    expect(runtime.navigate).not.toHaveBeenCalled()
  })

  it('uses the app’s Supporter button when given one', () => {
    setState({ usage: usage() })
    const cta = vi.fn(() => null)
    act(() => {
      create(<ScribeUsageScreen renderSupporterCta={cta} />)
    })
    expect(cta).toHaveBeenCalledWith({ onPress: expect.any(Function) })
  })

  it('reports the view once', () => {
    setState({ usage: usage() })
    const { renderer } = render()
    setState({ usage: usage({ asOf: 1 }) })
    act(() => renderer.update(<ScribeUsageScreen />))
    expect(
      runtime.capture.mock.calls.filter(([e]) => e === 'scribe_usage_viewed')
    ).toHaveLength(1)
  })
})

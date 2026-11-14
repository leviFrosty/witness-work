import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScribeSheetDismissal } from '@/features/scribe/components/ScribeSheetFrame'
import type { ScribeConsentRouteParams } from '@/types/rootStack'

const runtime = vi.hoisted(() => ({
  params: {} as ScribeConsentRouteParams,
  pending: true,
  capture: vi.fn(),
  accept: vi.fn(),
  settle: vi.fn(),
  navigation: {
    goBack: vi.fn(),
    replace: vi.fn(),
    beforeRemove: undefined as (() => void) | undefined,
    addListener: (_event: string, listener: () => void) => {
      runtime.navigation.beforeRemove = listener
      return () => {}
    },
  },
}))

vi.mock('react-native', () => ({
  ScrollView: 'ScrollView',
  View: 'View',
}))
vi.mock('lucide-react-native', () => ({
  ShieldCheck: 'ShieldCheck',
  SquareArrowOutUpRight: 'SquareArrowOutUpRight',
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => runtime.navigation,
  useRoute: () => ({ params: runtime.params }),
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChecklistIcon: 'ChecklistIcon',
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/constants/links', () => ({
  default: { termsOfUse: 'terms', privacyPolicy: 'privacy' },
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'font' }),
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/links', () => ({ openURL: vi.fn() }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({
  analytics: { capture: runtime.capture },
}))
vi.mock('@/features/scribe/components/scribeCopy', () => ({
  scribeKey: (key: string) => key,
}))
vi.mock('@/features/scribe/components/scribeConsentGate', () => ({
  settleScribeConsent: runtime.settle,
}))
vi.mock('@/features/scribe/stores/consent', () => ({
  acceptScribeTerms: runtime.accept,
  scribeTermsPending: () => runtime.pending,
}))
vi.mock('@/features/scribe/components/ScribeSheetFrame', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      children,
      onDismissRequest,
    }: {
      children?: ReactNode
      onDismissRequest: (via: ScribeSheetDismissal) => void
    }) => ReactModule.createElement('Sheet', { onDismissRequest }, children),
  }
})

import ScribeConsentSheet from '@/features/scribe/screens/ScribeConsentSheet'

const termsEvents = () =>
  runtime.capture.mock.calls.filter(
    ([event]) => event === 'scribe_terms_resolved'
  )

let renderer: ReactTestRenderer

const render = async () => {
  await act(async () => {
    renderer = create(<ScribeConsentSheet />)
  })
}

const texts = () =>
  renderer.root
    .findAllByType('Text' as never)
    .map((text) => text.props.children)

const dismiss = async (via: ScribeSheetDismissal) => {
  const sheet = renderer.root.findByType('Sheet' as never)
  await act(async () => sheet.props.onDismissRequest(via))
}

const pressAgree = async () => {
  const agree = renderer.root
    .findAllByType('Button' as never)
    .find((button) =>
      button
        .findAllByType('Text' as never)
        .some((text) => text.props.children === 'scribe_termsAgree')
    )
  await act(async () => agree!.props.onPress())
}

describe('ScribeConsentSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.params = {
      surface: 'first_open',
      next: { route: 'ScribeVoice', params: { entry: 'home_orb' } },
    }
    runtime.pending = true
    runtime.navigation.beforeRemove = undefined
  })

  it('is one step: what Scribe AI does, then the agreement', async () => {
    await render()
    const shown = texts()
    expect(shown.indexOf('scribe_termsIntro')).toBeGreaterThan(-1)
    expect(shown.indexOf('scribe_termsIntro')).toBeLessThan(
      shown.indexOf('scribe_termsBody')
    )
    expect(shown).toContain('scribe_termsPrivateBody')
    expect(shown).not.toContain('scribe_zdrTitle')
  })

  it('goes straight to where the entry was going after Agree', async () => {
    await render()
    await pressAgree()
    runtime.navigation.beforeRemove?.()

    expect(runtime.accept).toHaveBeenCalledTimes(1)
    expect(runtime.settle).toHaveBeenCalledWith(true)
    expect(runtime.navigation.replace).toHaveBeenCalledWith('ScribeVoice', {
      entry: 'home_orb',
    })
    expect(termsEvents()).toEqual([
      [
        'scribe_terms_resolved',
        { surface: 'first_open', outcome: 'accepted', via: null },
      ],
    ])
  })

  it('closes back to the caller when there is nowhere to go', async () => {
    runtime.params = { surface: 'settings' }
    await render()
    await pressAgree()

    expect(runtime.navigation.goBack).toHaveBeenCalledTimes(1)
    expect(runtime.settle).toHaveBeenCalledWith(true)
  })

  it.each([
    ['swipe', 'swipe'],
    ['backdrop', 'backdrop'],
    ['escape', 'system'],
  ] as const)('records a %s dismissal once', async (via, recorded) => {
    await render()
    await dismiss(via)
    runtime.navigation.beforeRemove?.()

    expect(runtime.navigation.goBack).toHaveBeenCalledTimes(1)
    expect(runtime.settle).toHaveBeenCalledTimes(1)
    expect(runtime.settle).toHaveBeenCalledWith(false)
    expect(termsEvents()).toEqual([
      [
        'scribe_terms_resolved',
        { surface: 'first_open', outcome: 'dismissed', via: recorded },
      ],
    ])
    expect(runtime.accept).not.toHaveBeenCalled()
  })

  it('records Android Back and other system closes as system', async () => {
    await render()
    await act(async () => runtime.navigation.beforeRemove?.())

    expect(runtime.settle).toHaveBeenCalledWith(false)
    expect(termsEvents()).toEqual([
      [
        'scribe_terms_resolved',
        { surface: 'first_open', outcome: 'dismissed', via: 'system' },
      ],
    ])
  })

  it('goes on without asking when this device already agreed', async () => {
    runtime.pending = false
    await render()

    expect(renderer.toJSON()).toBeNull()
    expect(runtime.settle).toHaveBeenCalledWith(true)
    expect(runtime.navigation.replace).toHaveBeenCalledWith('ScribeVoice', {
      entry: 'home_orb',
    })
    expect(termsEvents()).toEqual([])
  })
})

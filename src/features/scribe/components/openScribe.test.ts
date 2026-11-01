import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ capture: vi.fn(), consentPending: false }))

vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({}) }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/features/scribe/stores/consent', () => ({
  scribeConsentPending: () => runtime.consentPending,
}))
vi.mock('@/features/scribe', () => ({
  useScribeAvailability: () => ({ status: 'offline' }),
  useScribeVoiceAvailability: () => 'available',
}))

import {
  navigateToScribe,
  openScribe,
  scribeEntryState,
  scribeEntryTarget,
} from '@/features/scribe/components/openScribe'
import type {
  ScribeAvailability,
  ScribeVoiceAvailability,
} from '@/features/scribe/types'

const hidden: ScribeAvailability = { status: 'hidden', reason: 'flag_off' }
const offline: ScribeAvailability = { status: 'offline' }
const blocked: ScribeAvailability = {
  status: 'blocked',
  reason: 'update_required',
}
const available: ScribeAvailability = {
  status: 'available',
  limited: false,
  resetsAt: null,
}
const limited: ScribeAvailability = {
  status: 'available',
  limited: true,
  resetsAt: 1,
}

describe('Scribe AI entry points', () => {
  beforeEach(() => {
    runtime.capture.mockClear()
    runtime.consentPending = false
  })

  it.each<[string, ScribeAvailability, ScribeVoiceAvailability, unknown]>([
    ['hidden', hidden, 'available', null],
    ['offline', offline, 'available', { route: 'ScribeOffline' }],
    [
      'blocked',
      blocked,
      'available',
      { route: 'ScribeConversation', params: { entry: 'home_orb' } },
    ],
    [
      'limited',
      limited,
      'available',
      { route: 'ScribeConversation', params: { entry: 'home_orb' } },
    ],
    [
      'available without on-device speech',
      available,
      'unsupported',
      {
        route: 'ScribeConversation',
        params: { entry: 'home_orb', focusComposer: true },
      },
    ],
    [
      'available, speech still checking',
      available,
      'checking',
      { route: 'ScribeVoice', params: { entry: 'home_orb' } },
    ],
    [
      'available with speech',
      available,
      'available',
      { route: 'ScribeVoice', params: { entry: 'home_orb' } },
    ],
  ])('%s', (_, availability, voice, target) => {
    expect(scribeEntryTarget('home_orb', availability, voice)).toEqual(target)
  })

  it('reports the state a tap saw', () => {
    expect(scribeEntryState(hidden, 'available')).toBeNull()
    expect(scribeEntryState(offline, 'available')).toBe('offline')
    expect(scribeEntryState(blocked, 'available')).toBe('blocked')

    expect(scribeEntryState(limited, 'unsupported')).toBe('limited')
    expect(scribeEntryState(available, 'unsupported')).toBe('voice_unsupported')
    expect(scribeEntryState(available, 'checking')).toBe('available')
  })

  it('navigates and records the tap', () => {
    const navigation = { navigate: vi.fn() }
    openScribe(navigation, 'plus_sheet', available, 'available')
    expect(navigation.navigate).toHaveBeenCalledWith('ScribeVoice', {
      entry: 'plus_sheet',
    })
    expect(runtime.capture).toHaveBeenCalledWith('scribe_entry_tapped', {
      entry: 'plus_sheet',
      state: 'available',
    })

    openScribe(navigation, 'menu_bar', offline, 'available')
    expect(navigation.navigate).toHaveBeenLastCalledWith('ScribeOffline')
    expect(runtime.capture).toHaveBeenLastCalledWith('scribe_entry_tapped', {
      entry: 'menu_bar',
      state: 'offline',
    })

    openScribe(navigation, 'home_orb', limited, 'available')
    expect(navigation.navigate).toHaveBeenLastCalledWith('ScribeConversation', {
      entry: 'home_orb',
    })
  })

  it('asks for consent first while this device has steps to see', () => {
    runtime.consentPending = true
    const navigation = { navigate: vi.fn() }
    openScribe(navigation, 'home_orb', available, 'available')
    expect(navigation.navigate).toHaveBeenCalledWith('ScribeConsent', {
      mode: 'open',
      next: { route: 'ScribeVoice', params: { entry: 'home_orb' } },
    })

    expect(runtime.capture).toHaveBeenCalledWith('scribe_entry_tapped', {
      entry: 'home_orb',
      state: 'available',
    })

    navigateToScribe(navigation, {
      route: 'ScribeConversation',
      params: { entry: 'onboarding', focusComposer: true },
    })
    expect(navigation.navigate).toHaveBeenLastCalledWith('ScribeConsent', {
      mode: 'open',
      next: {
        route: 'ScribeConversation',
        params: { entry: 'onboarding', focusComposer: true },
      },
    })
  })

  it('explains offline without asking for consent', () => {
    runtime.consentPending = true
    const navigation = { navigate: vi.fn() }
    openScribe(navigation, 'home_orb', offline, 'available')
    expect(navigation.navigate).toHaveBeenCalledWith('ScribeOffline')
  })

  it('does nothing while Scribe AI is hidden', () => {
    const navigation = { navigate: vi.fn() }
    openScribe(navigation, 'home_orb', hidden, 'available')
    expect(navigation.navigate).not.toHaveBeenCalled()
    expect(runtime.capture).not.toHaveBeenCalled()
  })
})

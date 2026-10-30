import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScribeConversationParams } from '@/features/scribe/types'

const runtime = vi.hoisted(() => ({
  params: {} as ScribeConversationParams,
  send: vi.fn(async () => {}),
  setParams: vi.fn(),
}))

vi.mock('react-native-reanimated', async () => {
  const ReactModule = await import('react')
  return {
    default: {
      View: ({ children }: { children?: ReactNode }) =>
        ReactModule.createElement('AnimatedView', null, children),
    },
    KeyboardState: { UNKNOWN: 0, OPEN: 2 },
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),
    useAnimatedReaction: () => {},
    useAnimatedStyle: () => ({}),
    useSharedValue: <T,>(value: T) => ({ value }),
  }
})
vi.mock('react-native', () => ({
  Keyboard: { isVisible: () => false, dismiss: vi.fn() },
  Platform: {
    OS: 'ios',
    select(specifics: Record<string, unknown>) {
      return this.OS in specifics ? specifics[this.OS] : specifics.default
    },
  },
  View: 'View',
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setParams: (next: Partial<ScribeConversationParams>) => {
      runtime.setParams(next)
      runtime.params = { ...runtime.params, ...next }
    },
    addListener: () => () => {},
    navigate: vi.fn(),
  }),
  useRoute: () => ({ params: runtime.params }),
}))
vi.mock('@/components/ui/layout/Wrapper', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Wrapper', null, children),
  }
})
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/features/scribe', () => ({
  forgoScribeResume: vi.fn(),
  useScribeAvailability: () => ({
    status: 'available',
    limited: false,
    resetsAt: null,
  }),
  useScribeConversation: () => ({
    conversationId: null,
    items: [],
    run: { phase: 'idle' },
    send: runtime.send,
    stop: vi.fn(),
  }),
  useScribePaperCapture: () => ({
    available: false,
    busy: false,
    unread: null,
    clearError: vi.fn(),
    capture: vi.fn(),
    retry: vi.fn(),
    skip: vi.fn(),
  }),
  useScribePhotoCapture: () => ({ available: false, busy: false }),
  useScribeUsage: () => ({ usage: null }),
  useScribeVoiceAvailability: () => 'available',
}))
vi.mock('@/features/scribe/components/ScribeConversationHeader', () => ({
  default: 'ScribeConversationHeader',
}))
vi.mock('@/features/scribe/components/ScribeTimeline', () => ({
  default: 'ScribeTimeline',
}))
vi.mock('@/features/scribe/components/ScribeVoiceSheet', () => ({
  default: 'ScribeVoiceSheet',
}))
vi.mock('@/features/scribe/components/ScribeComposer', () => ({
  default: 'ScribeComposer',
}))
vi.mock('@/features/scribe/components/ScribeConversationFooter', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ composer }: { composer: ReactNode }) =>
      ReactModule.createElement('Footer', null, composer),
  }
})

import ScribeConversationScreen from '@/features/scribe/screens/ScribeConversationScreen'

const render = () => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeConversationScreen />)
  })
  const composer = () =>
    renderer.root.findAll(
      (node) => (node.type as unknown) === 'ScribeComposer'
    )[0]
  return { renderer, composer }
}

describe('ScribeConversationScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    runtime.params = { entry: 'home_orb' }
  })

  it('puts what a recording heard in the composer, unsent', () => {
    runtime.params = {
      entry: 'home_orb',
      draftText: 'Two hours this morning',
      focusComposer: true,
    }
    const { composer } = render()
    expect(composer().props.value).toBe('Two hours this morning')
    expect(runtime.setParams).toHaveBeenCalledWith({ draftText: undefined })
    expect(runtime.send).not.toHaveBeenCalled()
  })

  it('adds a later recording after what was already typed', () => {
    const { renderer, composer } = render()
    act(() => composer().props.onChangeText('I did two hours '))
    runtime.params = { ...runtime.params, draftText: 'and a return visit' }
    act(() => renderer.update(<ScribeConversationScreen />))
    expect(composer().props.value).toBe('I did two hours and a return visit')
  })

  it('sends the draft as voice input', () => {
    runtime.params = { entry: 'home_orb', draftText: 'Two hours' }
    const { composer } = render()
    act(() => composer().props.onSend())
    expect(runtime.send).toHaveBeenCalledWith({
      text: 'Two hours',
      source: 'voice',
      entry: 'home_orb',
    })
  })
})

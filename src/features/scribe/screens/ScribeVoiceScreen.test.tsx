import React, { type ReactNode } from 'react'
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ScribeVoiceCapture,
  ScribeVoiceCaptureOptions,
  ScribeVoiceParams,
} from '@/features/scribe/types'

type BeforeRemove = {
  preventDefault: () => void
  data?: { action: unknown }
}

const runtime = vi.hoisted(() => ({
  params: {} as ScribeVoiceParams,
  capture: null as unknown as ScribeVoiceCapture,
  options: null as unknown as ScribeVoiceCaptureOptions,
  finishedTurn: false,
  alert: vi.fn(),
  announce: vi.fn(),
  light: vi.fn(),
  error: vi.fn(),
  capture_event: vi.fn(),
  navigation: {
    dispatch: vi.fn(),
    popTo: vi.fn(),
    replace: vi.fn(),
    goBack: vi.fn(),
    beforeRemove: undefined as ((event: BeforeRemove) => void) | undefined,
    addListener: (_event: string, listener: (event: BeforeRemove) => void) => {
      runtime.navigation.beforeRemove = listener
      return () => {}
    },
  },
}))

vi.mock('react-native', () => ({
  AccessibilityInfo: { announceForAccessibility: runtime.announce },
  Alert: { alert: runtime.alert },
  Modal: 'Modal',
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: 800, fontScale: 1 }),
}))
vi.mock('lucide-react-native', () => ({
  Check: 'Check',
  CircleAlert: 'CircleAlert',
  Keyboard: 'Keyboard',
  Mic: 'Mic',
  MicOff: 'MicOff',
  X: 'X',
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
}))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  ZoomIn: { duration: () => ({}) },
}))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/lib/analytics', () => ({
  analytics: { capture: runtime.capture_event },
}))
vi.mock('@/features/scribe/components/ScribeOrb', () => ({
  default: 'ScribeOrb',
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'submit-1' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => runtime.navigation,
  useRoute: () => ({ params: runtime.params }),
}))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/PointerTooltip', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  }
})
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: new Proxy({}, { get: () => '#000' }) }),
}))
vi.mock('@/lib/haptics', () => ({
  default: { light: runtime.light, soft: vi.fn(), error: runtime.error },
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
}))
vi.mock('@/features/scribe', () => ({
  SCRIBE_VOICE_DISCARD_CONFIRM_MS: 15_000,
  useScribeHasFinishedTurn: () => runtime.finishedTurn,
  useScribeVoiceCapture: (options: ScribeVoiceCaptureOptions) => {
    runtime.options = options
    return runtime.capture
  },
}))
vi.mock('@/features/scribe/shaders/orbPalette', () => ({
  isDarkTheme: () => false,
}))
vi.mock('@/features/scribe/components/ScribeSheetFrame', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      children,
      onDismissRequest,
      onMinimizeRequest,
    }: {
      children?: ReactNode
      onDismissRequest: () => void
      onMinimizeRequest?: () => void
    }) =>
      ReactModule.createElement(
        'Sheet',
        { onDismissRequest, onMinimizeRequest },
        children
      ),
  }
})
vi.mock('@/features/scribe/components/ScribeBadge', () => ({
  ScribePill: 'ScribePill',
}))
vi.mock('@/features/scribe/components/ScribeVoiceMessage', () => ({
  default: 'ScribeVoiceMessage',
}))
vi.mock('@/features/scribe/components/ScribeVoiceStage', () => ({
  default: 'ScribeVoiceStage',
  pickVoiceExample: () => 'example',
}))
vi.mock('@/features/scribe/components/ScribeVoiceControls', () => ({
  Elapsed: 'Elapsed',
  RoundButton: 'RoundButton',
}))

import ScribeVoiceScreen from '@/features/scribe/screens/ScribeVoiceScreen'
import ScribeVoiceSheet from '@/features/scribe/components/ScribeVoiceSheet'

const setCapture = (overrides: Partial<ScribeVoiceCapture> = {}) => {
  runtime.capture = {
    state: 'listening',
    preparingPercent: null,
    level: { value: 0 } as ScribeVoiceCapture['level'],
    elapsedMs: 4_000,
    quiet: false,
    remainingMs: null,
    error: null,
    start: vi.fn(async () => {}),
    confirmPermission: vi.fn(async () => {}),
    done: vi.fn(),
    switchToKeyboard: vi.fn(),
    discard: vi.fn(),
    openSettings: vi.fn(),
    ...overrides,
  }
}

const render = () => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeVoiceScreen />)
  })
  const root = renderer.root
  const find = (type: string) => root.findAll((node) => node.type === type)
  const message = (): ReactTestInstance | undefined =>
    find('ScribeVoiceMessage')[0]
  const stage = () => find('ScribeVoiceStage')[0]
  const button = (label: string) =>
    find('RoundButton').find((node) => node.props.label === label)!
  const typeButton = (): ReactTestInstance | undefined =>
    find('IconButton').find(
      (node) => node.props.accessibilityLabel === 'scribe_voiceTypeInstead'
    )
  return { message, stage, button, typeButton, find, renderer }
}

describe('ScribeVoiceScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.params = { entry: 'home_orb' }
    runtime.finishedTurn = false
    runtime.navigation.beforeRemove = undefined
    setCapture()
  })

  it('starts listening once when it opens', () => {
    render()
    expect(runtime.capture.start).toHaveBeenCalledTimes(1)
    // The capture taps when the mic goes live; the sheet doesn't tap again.
    expect(runtime.light).not.toHaveBeenCalled()
  })

  it('primes for the microphone, or types instead', () => {
    setCapture({ state: 'priming' })
    const { message, stage } = render()
    expect(stage()).toBeUndefined()
    expect(message()?.props.title).toBe('scribe_voicePrimingTitle')
    act(() => message()?.props.primary.onPress())
    expect(runtime.capture.confirmPermission).toHaveBeenCalledTimes(1)
    act(() => message()?.props.secondary.onPress())
    expect(runtime.navigation.replace).toHaveBeenCalledWith(
      'ScribeConversation',
      { entry: 'home_orb', conversationId: undefined, focusComposer: true }
    )
  })

  it('sends a denied microphone to Settings', () => {
    setCapture({ state: 'denied' })
    const { message } = render()
    expect(message()?.props.body).toBe('scribe_voiceDeniedBody')
    expect(message()?.props.primary.label).toBe('scribe_voiceOpenSettings')
    expect(message()?.props.primary.onPress).toBe(runtime.capture.openSettings)
  })

  it('shows the download while the speech model gets ready', () => {
    setCapture({ state: 'preparing', preparingPercent: 41.6 })
    expect(render().stage().props.title).toBe(
      'scribe_voiceDownloading {"percent":42}'
    )
  })

  it('shows an example while listening, until a first finished turn', () => {
    const first = render().stage()
    expect(first.props.title).toBe('scribe_voiceListening')
    expect(first.props.subtitle).toBe('example')

    runtime.finishedTurn = true
    expect(render().stage().props.subtitle).toBeNull()
  })

  it('hints at Done after a pause', () => {
    setCapture({ quiet: true })
    const { stage, button } = render()
    expect(stage().props.title).toBe('scribe_voicePauseHint')
    expect(stage().props.subtitle).toBe('scribe_voiceStillListening')
    expect(button('scribe_voiceDone').props.showHalo).toBe(true)
  })

  it('counts down the last seconds', () => {
    setCapture({ remainingMs: 12_400 })
    expect(render().stage().props.subtitle).toBe(
      'scribe_voiceTimeLeft {"seconds":13}'
    )
  })

  it('finishes on Done', () => {
    const { button } = render()
    act(() => button('scribe_voiceDone').props.onPress())
    expect(runtime.capture.done).toHaveBeenCalledTimes(1)
  })

  it('discards a short recording at once', () => {
    const { button } = render()
    act(() => button('scribe_voiceDiscard').props.onPress())
    expect(runtime.alert).not.toHaveBeenCalled()
    expect(runtime.capture.discard).toHaveBeenCalledTimes(1)
    expect(runtime.navigation.goBack).toHaveBeenCalledTimes(1)
  })

  it('asks before discarding a longer recording', () => {
    setCapture({ elapsedMs: 20_000 })
    const { button } = render()
    act(() => button('scribe_voiceDiscard').props.onPress())
    expect(runtime.capture.discard).not.toHaveBeenCalled()
    const [title, , actions] = runtime.alert.mock.calls[0]
    expect(title).toBe('scribe_voiceDiscardTitle')
    act(() => actions[1].onPress())
    expect(runtime.capture.discard).toHaveBeenCalledTimes(1)
    expect(runtime.navigation.goBack).toHaveBeenCalledTimes(1)
  })

  it('treats Back like Discard', () => {
    setCapture({ elapsedMs: 20_000 })
    render()
    const preventDefault = vi.fn()
    act(() => runtime.navigation.beforeRemove?.({ preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(runtime.alert).toHaveBeenCalledTimes(1)
  })

  it("says it didn't catch anything, and can try again", () => {
    const { message } = render()
    act(() => runtime.options.onFinished('  ', 'done'))
    expect(message()?.props.body).toBe('scribe_voiceNothingHeard')
    expect(runtime.navigation.replace).not.toHaveBeenCalled()
    act(() => message()?.props.primary.onPress())
    expect(runtime.capture.start).toHaveBeenCalledTimes(2)
    expect(message()).toBeUndefined()
  })

  it('sends what was said to a new conversation', () => {
    render()
    act(() => runtime.options.onFinished('Two hours this morning', 'done'))
    expect(runtime.navigation.replace).toHaveBeenCalledWith(
      'ScribeConversation',
      {
        entry: 'home_orb',
        conversationId: undefined,
        initialText: 'Two hours this morning',
        inputSource: 'voice',
        submitId: 'submit-1',
      }
    )
    // Leaving on its own doesn't ask to discard.
    const preventDefault = vi.fn()
    runtime.navigation.beforeRemove?.({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('returns Say a change to the conversation underneath', () => {
    runtime.params = { entry: 'say_a_change', conversationId: 'c1' }
    render()
    act(() => runtime.options.onFinished('Make it 10', 'done'))
    expect(runtime.navigation.popTo).toHaveBeenCalledWith(
      'ScribeConversation',
      expect.objectContaining({
        entry: 'say_a_change',
        conversationId: 'c1',
        initialText: 'Make it 10',
      })
    )
  })

  it('returns to the conversation it opened from, before its first message', () => {
    runtime.params = { entry: 'conversation' }
    render()
    act(() => runtime.options.onFinished('Two hours', 'done'))
    expect(runtime.navigation.replace).not.toHaveBeenCalled()
    expect(runtime.navigation.popTo).toHaveBeenCalledWith(
      'ScribeConversation',
      expect.objectContaining({
        entry: 'conversation',
        initialText: 'Two hours',
      })
    )
  })

  it('keeps an interrupted recording as a draft instead of sending it', () => {
    render()
    act(() => runtime.options.onFinished('Two hours this', 'interrupted'))
    expect(runtime.navigation.replace).toHaveBeenCalledWith(
      'ScribeConversation',
      {
        entry: 'home_orb',
        conversationId: undefined,
        draftText: 'Two hours this',
        focusComposer: true,
      }
    )
  })

  it("says it didn't catch anything when an interruption heard nothing", () => {
    const { message } = render()
    act(() => runtime.options.onFinished('', 'interrupted'))
    expect(message()?.props.body).toBe('scribe_voiceNothingHeard')
    expect(runtime.navigation.replace).not.toHaveBeenCalled()
  })

  it('types instead while listening, keeping what was heard', () => {
    const { typeButton } = render()
    act(() => typeButton()?.props.onPress())
    expect(runtime.capture.switchToKeyboard).toHaveBeenCalledTimes(1)
    act(() => runtime.options.onFinished('Two hours', 'typed'))
    expect(runtime.navigation.replace).toHaveBeenCalledWith(
      'ScribeConversation',
      expect.objectContaining({ draftText: 'Two hours', focusComposer: true })
    )
  })

  it('types instead with an empty composer when nothing was heard', () => {
    render()
    act(() => runtime.options.onFinished('', 'typed'))
    expect(runtime.navigation.replace).toHaveBeenCalledWith(
      'ScribeConversation',
      { entry: 'home_orb', conversationId: undefined, focusComposer: true }
    )
  })

  it('types instead while the microphone gets ready', () => {
    setCapture({ state: 'preparing' })
    const { typeButton } = render()
    act(() => typeButton()?.props.onPress())
    expect(runtime.capture.switchToKeyboard).not.toHaveBeenCalled()
    expect(runtime.navigation.replace).toHaveBeenCalledWith(
      'ScribeConversation',
      { entry: 'home_orb', conversationId: undefined, focusComposer: true }
    )
  })

  it('hides Type instead while finishing and behind a message', () => {
    setCapture({ state: 'finishing' })
    expect(render().typeButton()).toBeUndefined()
    setCapture({ state: 'priming' })
    expect(render().typeButton()).toBeUndefined()
  })

  it('announces listening once, but not the pause hint into the open mic', () => {
    const { renderer } = render()
    expect(runtime.announce).toHaveBeenCalledWith('scribe_voiceListening')
    setCapture({ quiet: true })
    act(() => renderer.update(<ScribeVoiceScreen />))
    setCapture({ quiet: false, elapsedMs: 9_000 })
    act(() => renderer.update(<ScribeVoiceScreen />))
    expect(runtime.announce).toHaveBeenCalledTimes(1)
  })

  it('announces the countdown once, not every second', () => {
    const { renderer } = render()
    setCapture({ remainingMs: 20_000 })
    act(() => renderer.update(<ScribeVoiceScreen />))
    expect(runtime.announce).toHaveBeenLastCalledWith(
      'scribe_voiceTimeLeft {"seconds":20}'
    )
    setCapture({ remainingMs: 19_000 })
    act(() => renderer.update(<ScribeVoiceScreen />))
    expect(runtime.announce).toHaveBeenCalledTimes(2)
  })

  it('offers typing when on-device speech is missing', () => {
    setCapture({ state: 'error', error: 'model_unavailable' })
    const { message } = render()
    expect(message()?.props.body).toBe('scribe_voiceModelUnavailable')
    expect(message()?.props.primary.label).toBe('scribe_voiceTypeInstead')
    expect(runtime.error).toHaveBeenCalledTimes(1)
  })
})

describe('ScribeVoiceSheet over a conversation', () => {
  const props = {
    onSend: vi.fn(),
    onType: vi.fn(),
    onClose: vi.fn(),
    onMinimizedChange: vi.fn(),
  }

  const renderInline = (minimized = false) => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<ScribeVoiceSheet {...props} minimized={minimized} />)
    })
    const find = (type: string) =>
      renderer.root.findAll((node) => node.type === type)
    const sheet = () => find('Sheet')[0]
    const modal = () => find('Modal')[0]
    const miniOrb = (): ReactTestInstance | undefined =>
      find('Button').find(
        (node) => node.props.accessibilityLabel === 'scribe_voiceMiniOrb'
      )
    const rerender = (next: boolean) =>
      act(() =>
        renderer.update(<ScribeVoiceSheet {...props} minimized={next} />)
      )
    return { sheet, modal, miniOrb, rerender }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    runtime.finishedTurn = false
    runtime.navigation.beforeRemove = undefined
    setCapture()
  })

  it('minimizes when pulled down while listening, keeping the recording', () => {
    const { sheet } = renderInline()
    act(() => sheet().props.onMinimizeRequest())
    expect(props.onMinimizedChange).toHaveBeenCalledWith(true)
    expect(runtime.capture.discard).not.toHaveBeenCalled()
    expect(runtime.capture_event).toHaveBeenCalledWith('scribe_voice_minimized')
  })

  it('shows a small orb that opens the sheet again', () => {
    const { modal, miniOrb } = renderInline(true)
    expect(modal().props.visible).toBe(false)
    act(() => miniOrb()?.props.onPress())
    expect(props.onMinimizedChange).toHaveBeenCalledWith(false)
  })

  it('sends what was said while minimized', () => {
    renderInline(true)
    act(() => runtime.options.onFinished('Two hours', 'done'))
    expect(props.onSend).toHaveBeenCalledWith('Two hours')
  })

  it('only dismisses before the microphone is live', () => {
    setCapture({ state: 'preparing' })
    const { sheet } = renderInline()
    expect(sheet().props.onMinimizeRequest).toBeUndefined()
  })

  it('opens again for the countdown and for a message', () => {
    setCapture({ remainingMs: 20_000 })
    const { modal, rerender } = renderInline(true)
    expect(modal().props.visible).toBe(true)
    expect(props.onMinimizedChange).toHaveBeenCalledWith(false)

    vi.clearAllMocks()
    setCapture()
    rerender(true)
    expect(modal().props.visible).toBe(false)
    act(() => runtime.options.onFinished('', 'done'))
    expect(modal().props.visible).toBe(true)
  })

  it('leaves the conversation once a minimized recording is discarded', () => {
    setCapture({ elapsedMs: 20_000 })
    renderInline(true)
    const action = { type: 'POP' }
    const preventDefault = vi.fn()
    act(() =>
      runtime.navigation.beforeRemove?.({ preventDefault, data: { action } })
    )
    expect(preventDefault).toHaveBeenCalledTimes(1)
    const [, , actions] = runtime.alert.mock.calls[0]
    act(() => actions[1].onPress())
    expect(runtime.capture.discard).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(runtime.navigation.dispatch).toHaveBeenCalledWith(action)
  })
})

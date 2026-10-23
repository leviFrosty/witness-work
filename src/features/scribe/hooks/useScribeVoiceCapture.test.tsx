import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { ScribeVoiceCapture } from '@/features/scribe/types'

const speech = vi.hoisted(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  return {
    getPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
  }
})

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Linking: { openSettings: vi.fn() },
}))
vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => ({ value }),
}))
vi.mock('../../../../modules/speech-transcription', () => ({
  isSupported: () => true,
  getPermissions: speech.getPermissions,
  requestPermissions: speech.requestPermissions,
  start: speech.start,
  stop: vi.fn(async () => ''),
  cancel: vi.fn(async () => {}),
  addListener: () => ({ remove: () => {} }),
  speechErrorCode: () => 'failed',
}))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: [] }) },
}))
vi.mock('@/lib/haptics', () => ({
  default: { light: vi.fn(), rigid: vi.fn(), success: vi.fn() },
}))
vi.mock('@/lib/audio', () => ({
  playCue: vi.fn(),
  prepareCues: vi.fn(async () => {}),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/features/scribe/lib/locale', () => ({
  speechLocaleCandidates: () => ['en-US'],
}))
vi.mock('@/features/scribe/analytics', () => ({
  trackCaptureFinished: vi.fn(),
}))

import { useScribeVoiceCapture } from '@/features/scribe/hooks/useScribeVoiceCapture'

const permissions = (status: 'granted' | 'denied' | 'undetermined') => ({
  status,
  microphone: status,
  speechRecognition: 'notRequired',
})

let capture: ScribeVoiceCapture
let renderer: ReactTestRenderer | undefined

const Probe = ({ onRender }: { onRender: (c: ScribeVoiceCapture) => void }) => {
  onRender(useScribeVoiceCapture({ onFinished: () => {} }))
  return null
}

beforeEach(async () => {
  vi.clearAllMocks()
  speech.getPermissions.mockResolvedValue(permissions('undetermined'))
  await act(async () => {
    renderer = create(
      <Probe
        onRender={(c) => {
          capture = c
        }}
      />
    )
  })
  await act(async () => {
    await capture.start()
  })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it('asks again after a first denial Android still lets the User take back', async () => {
  expect(capture.state).toBe('priming')
  // Android reports a denial it can still prompt for as undetermined.
  speech.requestPermissions.mockResolvedValueOnce(permissions('undetermined'))
  await act(async () => {
    await capture.confirmPermission()
  })
  expect(capture.state).toBe('priming')
  expect(speech.start).not.toHaveBeenCalled()

  speech.requestPermissions.mockResolvedValueOnce(permissions('denied'))
  await act(async () => {
    await capture.confirmPermission()
  })
  expect(capture.state).toBe('denied')
  expect(speech.requestPermissions).toHaveBeenCalledTimes(2)
})

it('starts listening once the microphone is allowed', async () => {
  speech.requestPermissions.mockResolvedValueOnce(permissions('granted'))
  speech.start.mockResolvedValueOnce({
    locale: 'en-US',
    engine: 'onDevice',
  })
  await act(async () => {
    await capture.confirmPermission()
  })
  expect(capture.state).toBe('listening')
})

it('starts nothing when discarded while the system asks', async () => {
  let answer!: (value: ReturnType<typeof permissions>) => void
  speech.requestPermissions.mockImplementationOnce(
    () => new Promise((resolve) => (answer = resolve))
  )
  let asking!: Promise<void>
  act(() => {
    asking = capture.confirmPermission()
  })
  expect(capture.state).toBe('requesting')
  act(() => capture.discard())
  await act(async () => {
    answer(permissions('granted'))
    await asking
  })
  expect(capture.state).toBe('idle')
  expect(speech.start).not.toHaveBeenCalled()
})

it('starts nothing when the screen goes while permissions are read', async () => {
  act(() => renderer?.unmount())
  renderer = undefined
  let answer!: (value: ReturnType<typeof permissions>) => void
  speech.getPermissions.mockImplementationOnce(
    () => new Promise((resolve) => (answer = resolve))
  )
  await act(async () => {
    renderer = create(
      <Probe
        onRender={(c) => {
          capture = c
        }}
      />
    )
  })
  let starting!: Promise<void>
  act(() => {
    starting = capture.start()
  })
  act(() => renderer?.unmount())
  renderer = undefined
  await act(async () => {
    answer(permissions('granted'))
    await starting
  })
  expect(speech.start).not.toHaveBeenCalled()
})

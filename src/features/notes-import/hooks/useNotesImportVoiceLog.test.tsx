import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (event: never) => void>()
  return {
    listeners,
    alert: vi.fn(),
    capture: vi.fn(),
    permissions: {
      status: 'granted',
      microphone: 'granted',
      speechRecognition: 'notRequired',
    },
    speech: {
      isSupported: vi.fn(() => true),
      getAvailability: vi.fn(async () => ({ available: true })),
      getPermissions: vi.fn(),
      requestPermissions: vi.fn(),
      start: vi.fn(async () => ({
        locale: 'en-US',
        engine: 'speechTranscriber',
      })),
      stop: vi.fn(async () => ''),
      cancel: vi.fn(async () => {}),
      speechErrorCode: vi.fn(() => 'failed'),
      addListener: vi.fn((event: string, listener: (event: never) => void) => {
        listeners.set(event, listener)
        return { remove: () => listeners.delete(event) }
      }),
    },
  }
})

vi.mock('react-native', () => ({
  Alert: { alert: mocks.alert },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Linking: { openSettings: vi.fn() },
}))
vi.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => ({ value }),
}))
vi.mock('../../../../modules/speech-transcription', () => mocks.speech)
vi.mock('@/stores/contactsStore', () => ({
  default: {
    getState: () => ({ contacts: [{ name: 'Tom' }, { name: ' Maria ' }] }),
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/haptics', () => ({
  default: { light: vi.fn(async () => {}), success: vi.fn(async () => {}) },
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
  _i18n: { locale: 'en-us' },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { useNotesImportVoiceLog } from '@/features/notes-import/hooks/useNotesImportVoiceLog'

let hook: ReturnType<typeof useNotesImportVoiceLog>
const onTranscript = vi.fn()

function Harness() {
  const value = useNotesImportVoiceLog({ onTranscript })
  useEffect(() => {
    hook = value
  })
  return null
}

const mount = async () => {
  await act(async () => {
    create(<Harness />)
  })
}

const emit = (event: string, payload: unknown) =>
  act(() => {
    mocks.listeners.get(event)?.(payload as never)
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listeners.clear()
  mocks.speech.getPermissions.mockResolvedValue(mocks.permissions)
})

it('records, streams the live transcript, and hands over the final text', async () => {
  mocks.speech.stop.mockResolvedValueOnce('Talked with Maria about Psalm 37')
  await mount()
  expect(hook.available).toBe(true)

  await act(() => hook.start())
  expect(mocks.speech.start).toHaveBeenCalledWith({
    localeCandidates: ['en-US'],
    contextualStrings: ['Maria', 'Tom'],
  })
  expect(hook.phase).toBe('recording')
  await emit('onTranscript', { text: 'Talked with Maria' })
  expect(hook.transcript).toBe('Talked with Maria')

  await act(() => hook.finish())
  expect(onTranscript).toHaveBeenCalledWith('Talked with Maria about Psalm 37')
  expect(hook.phase).toBe('idle')
  expect(hook.transcript).toBe('')
  expect(mocks.capture).toHaveBeenCalledWith(
    'notes_import_capture_finished',
    expect.objectContaining({
      method: 'voice',
      outcome: 'inserted',
      engine: 'speechTranscriber',
      duration: 'under_15s',
    })
  )
})

it('asks for access once, then points to Settings when it is denied', async () => {
  mocks.speech.getPermissions.mockResolvedValueOnce({
    ...mocks.permissions,
    status: 'undetermined',
  })
  mocks.speech.requestPermissions.mockResolvedValueOnce({
    ...mocks.permissions,
    status: 'denied',
  })
  await mount()

  await act(() => hook.start())
  expect(mocks.speech.requestPermissions).toHaveBeenCalledTimes(1)
  expect(mocks.speech.start).not.toHaveBeenCalled()
  expect(hook.phase).toBe('idle')
  expect(mocks.alert).toHaveBeenCalledWith(
    'notesImport_micDeniedTitle',
    'notesImport_micDeniedBody',
    expect.any(Array)
  )
  expect(mocks.capture).toHaveBeenCalledWith(
    'notes_import_capture_finished',
    expect.objectContaining({ outcome: 'permission_denied' })
  )
})

it('tells the user when nothing was heard and keeps the draft untouched', async () => {
  await mount()
  await act(() => hook.start())
  await act(() => hook.finish())
  expect(onTranscript).not.toHaveBeenCalled()
  expect(mocks.alert).toHaveBeenCalledWith(
    'notesImport_voiceEmptyTitle',
    'notesImport_voiceEmptyBody'
  )
})

it('keeps what was heard when a call interrupts the recording', async () => {
  await mount()
  await act(() => hook.start())
  await emit('onEnd', { text: 'Go back Thursday', reason: 'interrupted' })
  expect(onTranscript).toHaveBeenCalledWith('Go back Thursday')
  expect(hook.phase).toBe('idle')
})

it('discards the recording on cancel', async () => {
  await mount()
  await act(() => hook.start())
  await emit('onTranscript', { text: 'half a thought' })
  await act(async () => hook.cancel())
  expect(mocks.speech.cancel).toHaveBeenCalled()
  expect(onTranscript).not.toHaveBeenCalled()
  expect(hook.transcript).toBe('')
  expect(mocks.capture).toHaveBeenCalledWith(
    'notes_import_capture_finished',
    expect.objectContaining({ outcome: 'cancelled' })
  )
})

it('explains and hides the mic when the device cannot transcribe after all', async () => {
  const error = Object.assign(new Error('x'), {
    code: 'ERR_SPEECH_UNSUPPORTED',
  })
  mocks.speech.start.mockRejectedValueOnce(error)
  mocks.speech.speechErrorCode.mockReturnValueOnce('unsupported')
  await mount()
  expect(hook.available).toBe(true)
  await act(() => hook.start())
  expect(hook.available).toBe(false)
  expect(mocks.alert).toHaveBeenCalledWith(
    'notesImport_voiceErrorTitle',
    'notesImport_voiceUnsupported'
  )
})

it('stays hidden when no on-device recognizer serves the language', async () => {
  mocks.speech.getAvailability.mockResolvedValueOnce({ available: false })
  await mount()
  expect(hook.available).toBe(false)
})

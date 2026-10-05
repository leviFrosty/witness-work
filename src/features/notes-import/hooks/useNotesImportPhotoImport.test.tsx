import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  capture: vi.fn(),
  deleteAsync: vi.fn(async () => {}),
  picker: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
  },
  recognition: {
    isSupported: vi.fn(() => true),
    isDocumentScannerSupported: vi.fn(() => true),
    recognizeImage: vi.fn(),
    scanDocument: vi.fn(),
  },
}))

vi.mock('react-native', () => ({
  Alert: { alert: mocks.alert },
  Linking: { openSettings: vi.fn() },
}))
vi.mock('expo-image-picker', () => mocks.picker)
vi.mock('expo-file-system/legacy', () => ({ deleteAsync: mocks.deleteAsync }))
vi.mock('../../../../modules/text-recognition', () => mocks.recognition)
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/haptics', () => ({
  default: { success: vi.fn(async () => {}) },
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
  _i18n: { locale: 'es-es' },
}))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { useNotesImportPhotoImport } from '@/features/notes-import/hooks/useNotesImportPhotoImport'

let hook: ReturnType<typeof useNotesImportPhotoImport>
const onText = vi.fn()

function Harness() {
  const value = useNotesImportPhotoImport({ onText })
  useEffect(() => {
    hook = value
  })
  return null
}

const page = (...texts: string[]) => ({
  lines: texts.map((text, i) => ({
    text,
    confidence: 0.9,
    x: 0.1,
    y: 0.1 + i * 0.05,
    width: 0.5,
    height: 0.03,
  })),
})

beforeEach(async () => {
  vi.clearAllMocks()
  await act(async () => {
    create(<Harness />)
  })
})

it('reads every picked photo in order, then deletes the picker copies', async () => {
  mocks.picker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///a.jpg' }, { uri: 'file:///b.jpg' }],
  })
  mocks.recognition.recognizeImage
    .mockResolvedValueOnce(page('12 Oak St'))
    .mockResolvedValueOnce(page('14 Oak St'))

  await act(() => hook.choose())

  expect(mocks.recognition.recognizeImage).toHaveBeenNthCalledWith(
    1,
    'file:///a.jpg',
    { languages: ['es-ES'] }
  )
  expect(onText).toHaveBeenCalledWith('12 Oak St\n\n14 Oak St')
  expect(mocks.deleteAsync).toHaveBeenCalledWith('file:///a.jpg', {
    idempotent: true,
  })
  expect(mocks.deleteAsync).toHaveBeenCalledWith('file:///b.jpg', {
    idempotent: true,
  })
  expect(hook.reading).toBe(false)
  expect(mocks.capture).toHaveBeenCalledWith(
    'notes_import_capture_finished',
    expect.objectContaining({
      method: 'photo',
      photo_source: 'library',
      outcome: 'inserted',
      page_count: 2,
    })
  )
})

it('records a cancelled pick without reading anything', async () => {
  mocks.picker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: true,
    assets: null,
  })
  await act(() => hook.choose())
  expect(mocks.recognition.recognizeImage).not.toHaveBeenCalled()
  expect(onText).not.toHaveBeenCalled()
  expect(mocks.capture).toHaveBeenCalledWith(
    'notes_import_capture_finished',
    expect.objectContaining({ outcome: 'cancelled' })
  )
})

it('explains an unreadable scan instead of inserting nothing', async () => {
  mocks.picker.getCameraPermissionsAsync.mockResolvedValueOnce({
    granted: true,
  })
  mocks.recognition.scanDocument.mockResolvedValueOnce([page()])
  await act(() => hook.scan())
  expect(onText).not.toHaveBeenCalled()
  expect(mocks.alert).toHaveBeenCalledWith(
    'notesImport_photoEmptyTitle',
    'notesImport_photoEmptyBody'
  )
})

it('offers Settings or the photo picker when camera access is off', async () => {
  mocks.picker.getCameraPermissionsAsync.mockResolvedValueOnce({
    granted: false,
    canAskAgain: false,
  })
  await act(() => hook.scan())
  expect(mocks.picker.requestCameraPermissionsAsync).not.toHaveBeenCalled()
  expect(mocks.recognition.scanDocument).not.toHaveBeenCalled()
  const buttons = mocks.alert.mock.calls[0][2] as { text: string }[]
  expect(buttons.map((button) => button.text)).toEqual([
    'cancel',
    'notesImport_photoChoose',
    'notesImport_openSettings',
  ])
})

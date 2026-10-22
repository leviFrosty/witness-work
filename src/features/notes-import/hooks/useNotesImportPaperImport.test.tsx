import React, { useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  capture: vi.fn(),
  deleteAsync: vi.fn(async (_uri: string, _options?: object) => {}),
  /** Page image → how its read ends; a missing entry reads as "text of <image>". */
  failures: new Map<string, string>(),
}))

vi.mock('react-native', () => ({ Alert: { alert: mocks.alert } }))
vi.mock('expo-image-picker', () => ({}))
vi.mock('expo-file-system/legacy', () => ({ deleteAsync: mocks.deleteAsync }))
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/haptics', () => ({
  default: { success: vi.fn(async () => {}) },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/features/notes-import/lib/notesImportClient', () => {
  class NotesImportClientError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return {
    NotesImportClientError,
    transcribeNotesPage: async ({
      image,
      signal,
    }: {
      image: string
      signal: AbortSignal
    }) => {
      // Let every page of the batch start before any of them ends.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const failure = mocks.failures.get(image)
      if (failure === 'hang') {
        return new Promise((_, reject) => {
          const cancel = () => reject(new NotesImportClientError('cancelled'))
          if (signal.aborted) cancel()
          else signal.addEventListener('abort', cancel)
        })
      }
      if (failure) throw new NotesImportClientError(failure)
      return { text: `text of ${image}`, truncated: false }
    },
  }
})
vi.mock(
  '@/features/notes-import/lib/notesImportPaper',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    preparePaperPage: async (page: { uri: string }) => page.uri,
  })
)

import { useNotesImportPaperImport } from '@/features/notes-import/hooks/useNotesImportPaperImport'

let hook: ReturnType<typeof useNotesImportPaperImport>
let renderer: ReactTestRenderer
const onText = vi.fn()
const onLimitReached = vi.fn()

function Harness() {
  const value = useNotesImportPaperImport({
    maxPages: 10,
    onText,
    onLimitReached,
  })
  useEffect(() => {
    hook = value
  })
  return null
}

const pages = ['p1', 'p2', 'p3'].map((uri) => ({
  uri,
  width: 1000,
  height: 1400,
}))

type AlertButton = { text: string; onPress?: () => void }
const lastAlert = () => {
  const [title, body, buttons] = mocks.alert.mock.calls.at(-1) ?? []
  return { title, body, buttons: (buttons ?? []) as AlertButton[] }
}
const press = async (text: string) => {
  const button = lastAlert().buttons.find((b) => b.text === text)
  expect(button).toBeDefined()
  await act(async () => {
    button?.onPress?.()
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}
const deleted = () => mocks.deleteAsync.mock.calls.map(([uri]) => uri)
const lastEvent = () => mocks.capture.mock.calls.at(-1)?.[1]

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.failures.clear()
  await act(async () => {
    renderer = create(<Harness />)
  })
})

it('keeps pages left unread offline, and Try Again reads them without picking again', async () => {
  mocks.failures.set('p2', 'network')
  mocks.failures.set('p3', 'hang')

  await act(() => hook.read(pages, 'composer'))

  // Page 1 lands; pages 2 and 3 wait, and their copies are kept.
  expect(onText).toHaveBeenCalledTimes(1)
  expect(onText).toHaveBeenCalledWith('text of p1')
  expect(deleted()).toEqual([])
  expect(lastAlert().body).toBe('notesImport_networkError')
  expect(lastAlert().buttons.map((b) => b.text)).toEqual([
    'notesImport_paperSkipUnread',
    'common_tryAgain',
  ])
  expect(lastEvent()).toMatchObject({
    outcome: 'partial',
    error_code: 'network',
    retry: false,
    retry_offered: true,
    page_count: 3,
  })

  mocks.failures.clear()
  await press('common_tryAgain')

  expect(onText).toHaveBeenLastCalledWith('text of p2\n\ntext of p3')
  expect(deleted().sort()).toEqual(['p1', 'p2', 'p3'])
  expect(lastEvent()).toMatchObject({
    outcome: 'inserted',
    retry: true,
    page_count: 2,
  })
})

it('holds pages read after a missing one until it is read or skipped, keeping page order', async () => {
  mocks.failures.set('p1', 'model_error')

  await act(() => hook.read(pages, 'onboarding'))

  expect(onText).not.toHaveBeenCalled()
  expect(lastAlert().body).toBe('notesImport_paperUnreadBody')
  expect(deleted()).toEqual([])

  await press('notesImport_paperSkipUnread')

  expect(onText).toHaveBeenCalledWith('text of p2\n\ntext of p3')
  expect(deleted().sort()).toEqual(['p1', 'p2', 'p3'])
})

it('asks again when Try Again fails, and keeps the pages', async () => {
  mocks.failures.set('p3', 'network')
  await act(() => hook.read(pages, 'composer'))
  expect(onText).toHaveBeenCalledWith('text of p1\n\ntext of p2')

  await press('common_tryAgain')

  expect(lastAlert().body).toBe('notesImport_networkError')
  expect(lastEvent()).toMatchObject({
    outcome: 'failed',
    retry: true,
    retry_offered: true,
    page_count: 1,
  })
  expect(deleted()).toEqual([])
  expect(onText).toHaveBeenCalledTimes(1)
})

it('deletes the pages at once when no retry can read them', async () => {
  mocks.failures.set('p2', 'too_large')

  await act(() => hook.read(pages, 'composer'))

  expect(onText).toHaveBeenCalledWith('text of p1\n\ntext of p3')
  expect(lastAlert().title).toBe('notesImport_paperPartialTitle')
  expect(lastAlert().buttons).toEqual([])
  expect(deleted().sort()).toEqual(['p1', 'p2', 'p3'])
})

it('drops kept pages when the composer closes', async () => {
  mocks.failures.set('p1', 'network')
  await act(() => hook.read(pages, 'composer'))
  expect(deleted()).toEqual([])

  await act(async () => renderer.unmount())

  expect(deleted().sort()).toEqual(['p1', 'p2', 'p3'])
})

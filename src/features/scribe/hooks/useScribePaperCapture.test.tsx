import React, { useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  deleteAsync: vi.fn(async (_uri: string, _options?: object) => {}),
  /**
   * Page image → the code its read fails with; others read as "text of
   * <image>".
   */
  failures: new Map<string, string>(),
}))

vi.mock('expo-image-picker', () => ({}))
vi.mock('expo-file-system/legacy', () => ({ deleteAsync: mocks.deleteAsync }))
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/haptics', () => ({
  default: { success: vi.fn(async () => {}) },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/features/scribe/runtime/status', () => ({
  noteScribeFailure: vi.fn(),
}))
vi.mock('@/features/scribe/stores/usage', () => ({ noteUsage: vi.fn() }))
vi.mock('@/features/scribe/lib/defaultClient', async () => {
  const { ScribeClientError } = await import('@/features/scribe/lib/errors')
  const transcribe = async (
    { image }: { image: string },
    signal?: AbortSignal
  ) => {
    // Let every page of the batch start before any of them ends.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const failure = mocks.failures.get(image)
    if (failure === 'hang')
      return new Promise((_, reject) => {
        const cancel = () => reject(new ScribeClientError('cancelled'))
        if (signal?.aborted) cancel()
        else signal?.addEventListener('abort', cancel)
      })
    if (failure)
      throw new ScribeClientError(failure as 'network', {
        serverCode: failure === 'page_limit' ? 'transcribe_limit' : null,
      })
    return { text: `text of ${image}`, truncated: false, usage: null }
  }
  return { scribeClient: () => ({ transcribe }) }
})
vi.mock('@/features/scribe/lib/paper', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  preparePaperPage: async (page: { uri: string }) => page.uri,
}))

import { useScribePaperCapture } from '@/features/scribe/hooks/useScribePaperCapture'

let hook: ReturnType<typeof useScribePaperCapture>
let renderer: ReactTestRenderer

function Harness() {
  const value = useScribePaperCapture()
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

const read = async () => {
  let text: string | null = null
  await act(async () => {
    text = await hook.capture('pages', pages)
  })
  return text
}
const retry = async () => {
  let text: string | null = null
  await act(async () => {
    text = await hook.retry()
  })
  return text
}
const deleted = () =>
  [...new Set(mocks.deleteAsync.mock.calls.map(([uri]) => uri))].sort()
const lastEvent = () => mocks.capture.mock.calls.at(-1)?.[1]

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.failures.clear()
  await act(async () => {
    renderer = create(<Harness />)
  })
})

it('keeps pages left unread offline, and Try again reads them without picking again', async () => {
  mocks.failures.set('p2', 'network')
  mocks.failures.set('p3', 'hang')

  // Page 1 lands and its copy goes; pages 2 and 3 wait, and theirs are kept.
  expect(await read()).toBe('text of p1')
  expect(deleted()).toEqual(['p1'])
  expect(hook.unread).toEqual({ count: 2, total: 3, reason: 'network' })
  expect(hook.error).toBeNull()
  expect(lastEvent()).toMatchObject({
    input: 'paper',
    outcome: 'done',
    error_code: 'network',
    pages: 3,
    retry: false,
    retry_offered: true,
  })

  mocks.failures.clear()
  expect(await retry()).toBe('text of p2\n\ntext of p3')

  expect(hook.unread).toBeNull()
  expect(deleted()).toEqual(['p1', 'p2', 'p3'])
  expect(lastEvent()).toMatchObject({
    outcome: 'done',
    error_code: null,
    pages: 2,
    retry: true,
  })
  expect(lastEvent()).not.toHaveProperty('retry_offered')
})

it('holds pages read after a missing one until it is read or skipped, keeping page order', async () => {
  mocks.failures.set('p1', 'model_error')

  expect(await read()).toBeNull()
  expect(hook.unread).toEqual({ count: 1, total: 3, reason: null })
  expect(lastEvent()).toMatchObject({
    outcome: 'done',
    error_code: 'model_error',
    retry_offered: true,
  })
  expect(deleted()).toEqual(['p2', 'p3'])

  let skipped: string | null = null
  act(() => {
    skipped = hook.skip()
  })

  expect(skipped).toBe('text of p2\n\ntext of p3')
  expect(hook.unread).toBeNull()
  expect(deleted()).toEqual(['p1', 'p2', 'p3'])
})

it('asks again when Try again fails, and keeps the pages', async () => {
  mocks.failures.set('p3', 'network')
  expect(await read()).toBe('text of p1\n\ntext of p2')

  expect(await retry()).toBeNull()

  expect(hook.unread).toEqual({ count: 1, total: 3, reason: 'network' })
  expect(lastEvent()).toMatchObject({
    outcome: 'error',
    pages: 1,
    retry: true,
    retry_offered: true,
  })
  expect(deleted()).toEqual(['p1', 'p2'])
})

it('deletes the pages at once when no retry can read them', async () => {
  mocks.failures.set('p2', 'page_limit')
  mocks.failures.set('p3', 'hang')

  expect(await read()).toBe('text of p1')

  expect(hook.unread).toBeNull()
  expect(hook.error).toBe('page_limit')
  expect(deleted()).toEqual(['p1', 'p2', 'p3'])
  expect(lastEvent()).toMatchObject({ error_code: 'page_limit', retry: false })
  expect(lastEvent()).not.toHaveProperty('retry_offered')
})

it('puts what a kept batch read first when new pages are picked', async () => {
  mocks.failures.set('p1', 'network')
  mocks.failures.set('p2', 'hang')
  mocks.failures.set('p3', 'hang')
  await read()
  expect(hook.unread).not.toBeNull()

  mocks.failures.clear()
  let text: string | null = null
  await act(async () => {
    text = await hook.capture('pages', [
      { uri: 'q1', width: 1000, height: 1400 },
    ])
  })

  expect(text).toBe('text of q1')
  expect(hook.unread).toBeNull()
  expect(deleted()).toEqual(['p1', 'p2', 'p3', 'q1'])
})

it('drops the kept pages when the conversation closes', async () => {
  mocks.failures.set('p1', 'network')
  mocks.failures.set('p2', 'hang')
  await read()
  expect(deleted()).toEqual([])

  await act(async () => renderer.unmount())

  expect(deleted()).toEqual(['p1', 'p2', 'p3'])
})

it('stops reading and deletes the pages when the conversation closes mid-read', async () => {
  mocks.failures.set('p1', 'hang')
  mocks.failures.set('p2', 'hang')
  let reading!: Promise<string | null>
  await act(async () => {
    reading = hook.capture('pages', pages)
    await new Promise((resolve) => setTimeout(resolve, 5))
  })

  await act(async () => renderer.unmount())

  expect(await reading).toBeNull()
  expect(deleted()).toEqual(['p1', 'p2', 'p3'])
  expect(lastEvent()).toMatchObject({ outcome: 'discarded', pages: 3 })
})

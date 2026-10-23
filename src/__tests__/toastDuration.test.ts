import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  // Android's "Time to take action" setting; 0 is the system default.
  actionTimeout: 0,
  recommended: vi.fn(),
}))

// Android's AccessibilityManager: the longer of the two.
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    getRecommendedTimeoutMillis: native.recommended,
  },
}))

vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  SCREEN_READER_ACTION_TOAST_MS,
  SCREEN_READER_TOAST_MS,
  TOAST_MS,
  toastDuration,
} from '@/lib/toastDuration'

describe('toastDuration', () => {
  beforeEach(() => {
    native.actionTimeout = 0
    native.recommended.mockReset()
    native.recommended.mockImplementation(async (ms: number) =>
      Math.max(ms, native.actionTimeout)
    )
  })

  it("keeps each intent's default without a screen reader", async () => {
    expect(await toastDuration('undo', false)).toBe(5000)
    expect(native.recommended).toHaveBeenCalledWith(TOAST_MS.undo)
    expect(await toastDuration('unlock', false)).toBe(TOAST_MS.unlock)
    expect(await toastDuration('success', false)).toBe(TOAST_MS.success)
  })

  it('uses a requested duration', async () => {
    expect(await toastDuration('success', false, 2000)).toBe(2000)
  })

  it('stays at least ten times longer for Undo with a screen reader on', async () => {
    const ms = await toastDuration('undo', true)
    expect(ms).toBe(SCREEN_READER_ACTION_TOAST_MS)
    expect(ms).toBeGreaterThanOrEqual(TOAST_MS.undo * 10)
    expect(await toastDuration('unlock', true)).toBe(
      SCREEN_READER_ACTION_TOAST_MS
    )
  })

  it('gives a toast with no button long enough to be heard', async () => {
    expect(await toastDuration('success', true)).toBe(SCREEN_READER_TOAST_MS)
  })

  it("honors Android's Time to take action setting", async () => {
    native.actionTimeout = 30_000
    expect(await toastDuration('undo', false)).toBe(30_000)
    native.actionTimeout = 120_000
    expect(await toastDuration('undo', true)).toBe(120_000)
  })

  it('never goes below its own duration when Android answers 0', async () => {
    native.recommended.mockResolvedValue(0)
    expect(await toastDuration('undo', false)).toBe(TOAST_MS.undo)
    expect(await toastDuration('undo', true)).toBe(
      SCREEN_READER_ACTION_TOAST_MS
    )
  })
})

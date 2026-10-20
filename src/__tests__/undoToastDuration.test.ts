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

import {
  SCREEN_READER_UNDO_TOAST_MS,
  UNDO_TOAST_MS,
  undoToastDuration,
} from '@/lib/undoToastDuration'

describe('undoToastDuration', () => {
  beforeEach(() => {
    native.actionTimeout = 0
    native.recommended.mockReset()
    native.recommended.mockImplementation(async (ms: number) =>
      Math.max(ms, native.actionTimeout)
    )
  })

  it('keeps the 5 s default without a screen reader', async () => {
    expect(await undoToastDuration(false)).toBe(5000)
    expect(native.recommended).toHaveBeenCalledWith(UNDO_TOAST_MS)
  })

  it('stays at least ten times longer with a screen reader on', async () => {
    const ms = await undoToastDuration(true)
    expect(ms).toBe(SCREEN_READER_UNDO_TOAST_MS)
    expect(ms).toBeGreaterThanOrEqual(UNDO_TOAST_MS * 10)
    expect(native.recommended).toHaveBeenCalledWith(SCREEN_READER_UNDO_TOAST_MS)
  })

  it("honors Android's Time to take action setting", async () => {
    native.actionTimeout = 30_000
    expect(await undoToastDuration(false)).toBe(30_000)
    native.actionTimeout = 120_000
    expect(await undoToastDuration(true)).toBe(120_000)
  })

  it('never goes below its own duration when Android answers 0', async () => {
    native.recommended.mockResolvedValue(0)
    expect(await undoToastDuration(false)).toBe(UNDO_TOAST_MS)
    expect(await undoToastDuration(true)).toBe(SCREEN_READER_UNDO_TOAST_MS)
  })
})

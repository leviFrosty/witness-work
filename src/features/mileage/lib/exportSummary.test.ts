import { describe, expect, it, vi } from 'vitest'
import { exportMileageSummary } from '@/features/mileage/lib/exportSummary'

const text =
  'September 2026 — Mileage\nTotal: 12 mi\nCar: 12 mi\n  Uncategorized: 12 mi'

describe('mileage summary export', () => {
  it('copies the complete summary and confirms only after clipboard completion', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn()
    expect(await exportMileageSummary(text, 'copy', { copy, share })).toBe(
      'copied'
    )
    expect(copy).toHaveBeenCalledWith(text)
    expect(share).not.toHaveBeenCalled()
  })

  it('shares the complete summary and preserves native cancellation', async () => {
    const copy = vi.fn()
    const share = vi
      .fn()
      .mockResolvedValueOnce('dismissed')
      .mockResolvedValueOnce('shared')
    expect(await exportMileageSummary(text, 'share', { copy, share })).toBe(
      'dismissed'
    )
    expect(await exportMileageSummary(text, 'share', { copy, share })).toBe(
      'shared'
    )
    expect(share).toHaveBeenCalledWith(text)
    expect(copy).not.toHaveBeenCalled()
  })

  it('does not turn failed copy or share into a success', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('unavailable'))
    await expect(
      exportMileageSummary(text, 'copy', { copy: fail, share: fail })
    ).rejects.toThrow('unavailable')
    await expect(
      exportMileageSummary(text, 'share', { copy: fail, share: fail })
    ).rejects.toThrow('unavailable')
  })
})

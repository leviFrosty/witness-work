import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setStringAsync: vi.fn(async () => true),
  success: vi.fn(),
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setStringAsync }))
vi.mock('@/stores/toasts', () => ({ toast: { success: mocks.success } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import Share from '@/vendor/web/share'

const device = (touch: boolean, share?: (data: unknown) => Promise<void>) => {
  vi.stubGlobal('matchMedia', () => ({ matches: touch }))
  vi.stubGlobal('navigator', { share })
}

describe('web Share', () => {
  beforeEach(() => {
    mocks.setStringAsync.mockClear()
    mocks.success.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('copies the text on a desktop and says it was shared', async () => {
    const share = vi.fn()
    device(false, share)
    const result = await Share.share({ message: 'March report' })
    expect(share).not.toHaveBeenCalled()
    expect(mocks.setStringAsync).toHaveBeenCalledWith('March report')
    expect(mocks.success).toHaveBeenCalledWith('copied')
    expect(result.action).toBe(Share.sharedAction)
  })

  it('does not claim a copy the browser refused', async () => {
    device(false)
    mocks.setStringAsync.mockResolvedValueOnce(false)
    const result = await Share.share({ message: 'March report' })
    expect(mocks.success).not.toHaveBeenCalled()
    expect(result.action).toBe(Share.dismissedAction)
  })

  it('copies a link as its URL', async () => {
    device(false)
    await Share.share({ url: 'https://example.com/c', title: 'Contact' })
    expect(mocks.setStringAsync).toHaveBeenCalledWith('https://example.com/c')
  })

  it('opens the share sheet on a phone', async () => {
    const share = vi.fn(async () => {})
    device(true, share)
    const result = await Share.share({ message: 'Report', title: 'Share' })
    expect(share).toHaveBeenCalledWith({
      title: 'Share',
      text: 'Report',
      url: undefined,
    })
    expect(mocks.setStringAsync).not.toHaveBeenCalled()
    expect(result.action).toBe(Share.sharedAction)
  })

  it('reports a closed share sheet as dismissed, without copying', async () => {
    device(true, async () => {
      throw new DOMException('closed', 'AbortError')
    })
    const result = await Share.share({ message: 'Report' })
    expect(result.action).toBe(Share.dismissedAction)
    expect(mocks.setStringAsync).not.toHaveBeenCalled()
  })

  it('copies when the browser refuses to share', async () => {
    device(true, async () => {
      throw new DOMException('no gesture', 'NotAllowedError')
    })
    const result = await Share.share({ message: 'Report' })
    expect(mocks.setStringAsync).toHaveBeenCalledWith('Report')
    expect(result.action).toBe(Share.sharedAction)
  })
})

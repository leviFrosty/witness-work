import { describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ platform: 'android', share: vi.fn() }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return native.platform
    },
  },
  Share: { share: native.share },
}))
import { shareUrl } from '@/lib/share'

describe('sharing links', () => {
  it('includes the URL in Android text so native Share does not drop it', () => {
    native.platform = 'android'
    shareUrl('https://example.com/contact', 'Contact')
    expect(native.share).toHaveBeenLastCalledWith({
      message: 'https://example.com/contact',
      title: 'Contact',
    })
  })
  it('keeps the iOS URL item for rich link previews without duplicated text', () => {
    native.platform = 'ios'
    shareUrl('https://example.com/contact', 'Contact')
    expect(native.share).toHaveBeenLastCalledWith({
      url: 'https://example.com/contact',
      title: 'Contact',
    })
  })
})

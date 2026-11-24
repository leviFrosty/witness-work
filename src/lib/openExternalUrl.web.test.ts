import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openExternalUrl } from '@/lib/openExternalUrl.web'

describe('openExternalUrl (web)', () => {
  const open = vi.fn()

  beforeEach(() => {
    open.mockReset().mockReturnValue(null)
    vi.stubGlobal('window', {
      open,
      location: { href: 'https://app.witnesswork.app/' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [
      'https://www.google.com/maps/search/?api=1&query=12%20Main%20St',
      'https://www.google.com/maps/search/?api=1&query=12%20Main%20St',
    ],
    ['http://example.com/territory', 'http://example.com/territory'],
    [
      'https://app.hourglass-app.com/report/submit?month=3&year=2026&minutes=600',
      'https://app.hourglass-app.com/report/submit?month=3&year=2026&minutes=600',
    ],
    ['mailto:alice@example.com', 'mailto:alice@example.com'],
    ['mailTo:alice@example.com', 'mailto:alice@example.com'],
    ['tel:+15555550100', 'tel:+15555550100'],
    ['sms:+15555550100', 'sms:+15555550100'],
  ])(
    'opens %s in a new tab without navigating the current tab',
    async (input, expected) => {
      await expect(openExternalUrl(input)).resolves.toBeUndefined()
      expect(open).toHaveBeenCalledExactlyOnceWith(
        expected,
        '_blank',
        'noopener,noreferrer'
      )
      expect(window.location.href).toBe('https://app.witnesswork.app/')
    }
  )

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '12 Main St',
    '',
  ])(
    'rejects unsafe or invalid URL %s without opening a tab',
    async (input) => {
      await expect(openExternalUrl(input)).rejects.toThrow()
      expect(open).not.toHaveBeenCalled()
    }
  )

  it('rejects when window is unavailable', async () => {
    vi.stubGlobal('window', undefined)
    await expect(openExternalUrl('https://example.com')).rejects.toThrow()
  })
})

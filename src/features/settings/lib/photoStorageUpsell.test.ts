import { describe, expect, it } from 'vitest'
import { upsellDismissed } from '@/features/settings/lib/photoStorageUpsell'

describe('photo storage upsell dismissal', () => {
  it('shows until dismissed', () => {
    expect(upsellDismissed(null, 'almost_full')).toBe(false)
    expect(upsellDismissed(null, 'full')).toBe(false)
  })

  it('comes back once storage turns full', () => {
    expect(upsellDismissed('almost_full', 'almost_full')).toBe(true)
    expect(upsellDismissed('almost_full', 'full')).toBe(false)
  })

  it('stays hidden after a full dismissal', () => {
    expect(upsellDismissed('full', 'full')).toBe(true)
    expect(upsellDismissed('full', 'almost_full')).toBe(true)
  })
})

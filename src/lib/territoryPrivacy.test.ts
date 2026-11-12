import { describe, expect, it } from 'vitest'
import { territoryPrivacyOn } from '@/lib/territoryPrivacy'

describe('territoryPrivacyOn', () => {
  it('follows data protection mode until the User chooses', () => {
    expect(
      territoryPrivacyOn({
        territoryPrivacyMode: null,
        dataProtectionMode: true,
      })
    ).toBe(true)
    expect(
      territoryPrivacyOn({
        territoryPrivacyMode: null,
        dataProtectionMode: false,
      })
    ).toBe(false)
  })

  it("keeps the User's own choice either way", () => {
    expect(
      territoryPrivacyOn({
        territoryPrivacyMode: true,
        dataProtectionMode: false,
      })
    ).toBe(true)
    expect(
      territoryPrivacyOn({
        territoryPrivacyMode: false,
        dataProtectionMode: true,
      })
    ).toBe(false)
  })
})

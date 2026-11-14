import { describe, expect, it } from 'vitest'
import { acceptedBundleIds } from './appId'

describe('acceptedBundleIds', () => {
  it('returns the primary bundle id alone by default', () => {
    expect(acceptedBundleIds({ IOS_BUNDLE_ID: 'com.example.app' })).toEqual([
      'com.example.app',
    ])
  })

  it('appends trimmed, de-duplicated additional ids after the primary', () => {
    expect(
      acceptedBundleIds({
        IOS_BUNDLE_ID: 'com.example.app',
        IOS_ADDITIONAL_BUNDLE_IDS: ' com.example.beta, ,com.example.app,com.example.beta ',
      })
    ).toEqual(['com.example.app', 'com.example.beta'])
  })

  it('fails closed without a primary bundle id', () => {
    expect(() => acceptedBundleIds({ IOS_BUNDLE_ID: ' ' })).toThrow(
      'IOS_BUNDLE_ID must be configured'
    )
  })
})

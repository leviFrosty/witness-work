import { describe, expect, it } from 'vitest'
import {
  getPackageKey,
  getVisiblePackages,
} from '@/features/supporter/lib/paywallOptions'

const packages = Array.from({ length: 8 }, (_, index) => ({
  offeringIdentifier: 'support',
  product: { identifier: `option-${index}` },
}))

describe.each([
  ['Supporter', 4],
  ['Tip', 5],
])('%s compact pricing options', (_view, visibleOptionLimit) => {
  it('shows an overflow selection after the preset options', () => {
    const selectedPackage = packages[visibleOptionLimit + 1]

    expect(
      getVisiblePackages(
        packages,
        visibleOptionLimit,
        getPackageKey(selectedPackage)
      )
    ).toEqual([...packages.slice(0, visibleOptionLimit), selectedPackage])
  })

  it('does not duplicate a selected preset option', () => {
    expect(
      getVisiblePackages(
        packages,
        visibleOptionLimit,
        getPackageKey(packages[1])
      )
    ).toEqual(packages.slice(0, visibleOptionLimit))
  })

  it('ignores a selection that is no longer available', () => {
    expect(
      getVisiblePackages(packages, visibleOptionLimit, 'missing:package')
    ).toEqual(packages.slice(0, visibleOptionLimit))
  })
})

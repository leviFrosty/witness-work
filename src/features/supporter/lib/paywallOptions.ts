interface PackageIdentity {
  offeringIdentifier: string
  product: {
    identifier: string
  }
}

export const getPackageKey = (pkg: PackageIdentity) =>
  `${pkg.offeringIdentifier}:${pkg.product.identifier}`

export const getVisiblePackages = <T extends PackageIdentity>(
  packages: readonly T[],
  visibleOptionLimit: number,
  selectedKey: string | null
): T[] =>
  packages.filter(
    (pkg, index) =>
      index < visibleOptionLimit || getPackageKey(pkg) === selectedKey
  )

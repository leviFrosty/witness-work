/**
 * The region code that decides the window's season (southern hemispheres flip
 * it): the Format Region's own region (`en-au` → `AU`, ADR 0006), else the
 * device's region. A Format Region without one (`de`) also uses the device's.
 */
export function petRegionCode(
  formatRegion: string | undefined,
  deviceRegion: string | null | undefined
): string | null {
  const region = formatRegion?.split(/[-_]/)[1]
  if (region && /^[a-z]{2}$/i.test(region)) return region.toUpperCase()
  return deviceRegion ? deviceRegion.toUpperCase() : null
}

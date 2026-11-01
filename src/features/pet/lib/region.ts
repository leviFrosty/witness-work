export function petRegionCode(
  formatRegion: string | undefined,
  deviceRegion: string | null | undefined
): string | null {
  const region = formatRegion?.split(/[-_]/)[1]
  if (region && /^[a-z]{2}$/i.test(region)) return region.toUpperCase()
  return deviceRegion ? deviceRegion.toUpperCase() : null
}

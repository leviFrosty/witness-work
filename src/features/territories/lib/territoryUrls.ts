import links from '@/constants/links'
import { resolveNavigationMapProvider } from '@/lib/navigationMapProvider'
import type { DefaultNavigationMapProvider } from '@/stores/preferences'
import { mapLinkFor } from '@/features/territories/lib/territoryLink'
import type { Territory } from '@/features/territories/types/territory'

type Place = Pick<Territory, 'coordinate' | 'link'>

export const territoryMapsUrl = (
  territory: Place,
  provider: DefaultNavigationMapProvider,
  platform: string
): string | undefined => {
  if (!territory.coordinate) return territory.link
  const { latitude, longitude } = territory.coordinate
  const point = encodeURIComponent(`${latitude},${longitude}`)
  switch (resolveNavigationMapProvider(provider, platform)) {
    case 'google':
      return `${links.googleMapsBase}${point}`
    case 'waze':
      return `https://waze.com/ul?ll=${point}&navigate=yes`
    default:
      return `${links.appleMapsBase}${point}`
  }
}

export const territoryQrValue = (territory: Place): string | undefined =>
  territory.link ??
  (territory.coordinate ? mapLinkFor(territory.coordinate) : undefined)

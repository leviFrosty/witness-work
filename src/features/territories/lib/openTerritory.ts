import { Platform } from 'react-native'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import type { DefaultNavigationMapProvider } from '@/stores/preferences'
import { territoryPoint } from '@/features/territories/lib/territoryArea'
import { mapLinkFor } from '@/features/territories/lib/territoryLink'
import { territoryMapsUrl } from '@/features/territories/lib/territoryUrls'
import type { Territory } from '@/features/territories/types/territory'

export const openTerritoryInMaps = (
  territory: Pick<Territory, 'coordinate' | 'link' | 'outline'>,
  provider: DefaultNavigationMapProvider
) => {
  const coordinate = territoryPoint(territory)
  const url = territoryMapsUrl(
    { link: territory.link, coordinate },
    provider,
    Platform.OS
  )
  if (!url) return
  void openURL(url, {
    alert: {
      title: i18n.t('couldNotOpenMaps'),
      description: i18n.t('couldNotOpenMaps_description'),
    },
    fallbackUrl: coordinate ? mapLinkFor(coordinate) : undefined,
  })
}

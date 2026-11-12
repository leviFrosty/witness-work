import { Image as ImageIcon, Map as MapIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import {
  hasMapView,
  hasTerritoryMap,
  streetFocus,
  territoryMapMarkers,
} from '@/features/territories/lib/territoryMap'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import type { Territory } from '@/features/territories/types/territory'

export default function TerritoryMapButton({
  territory,
  streetId,
  privacy,
  onOpen,
  fill = true,
}: {
  territory: Territory
  streetId: string
  privacy: boolean
  onOpen: (params: { streetId?: string; view?: 'card' }) => void
  fill?: boolean
}) {
  const markers = territoryMapMarkers(territory, {
    privacy,
    formatAddress: formatDoorAddress,
  })
  if (!hasTerritoryMap(territory, markers)) return null
  const focus = streetFocus(markers, streetId)
  const cardOnly = !hasMapView(territory, markers)
  return (
    <TerritoryPill
      icon={cardOnly ? ImageIcon : MapIcon}
      label={i18n.t(
        cardOnly
          ? 'territories.map.viewCard'
          : territory.photo
            ? 'territories.map.openWithCard'
            : 'territories.map.open'
      )}
      onPress={() =>
        onOpen({ streetId: focus, view: cardOnly ? 'card' : undefined })
      }
      testID='street-map-open'
      fill={fill}
    />
  )
}

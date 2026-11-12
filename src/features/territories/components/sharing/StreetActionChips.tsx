import { View } from 'react-native'
import {
  HandHelping as HandHelpingIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import i18n from '@/lib/locales'
import TerritoryMapButton from '@/features/territories/components/TerritoryMapButton'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import useLeaveReceived from '@/features/territories/hooks/useLeaveReceived'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import {
  holdsStreet,
  isReceivedLive,
  territoryAccess,
} from '@/features/territories/lib/sharing'
import {
  hasTerritoryMap,
  territoryMapMarkers,
} from '@/features/territories/lib/territoryMap'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export default function StreetActionChips({
  territory,
  street,
  privacy,
  onOpenMap,
  onShare,
  onHandOff,
}: {
  territory: Territory
  street: TerritoryStreet
  privacy: boolean
  onOpenMap: (params: { streetId?: string; view?: 'card' }) => void
  onShare: () => void
  onHandOff: () => void
}) {
  const sharing = useTerritorySharing()
  const access = territoryAccess(territory)
  const held = access === 'member' && holdsStreet(territory, street.id)
  const giveBack = useLeaveReceived(territory, held ? street.id : undefined)
  const live = isReceivedLive(territory)
  const open = territory.finishedAt === undefined && live
  const canShare =
    open && (access !== 'member' || held) && street.handoff === undefined
  const canHandOff = canShare && access === 'owner' && sharing.buddiesAvailable
  const canGiveBack = open && (access === 'assigned' || held)
  const showsMap = hasTerritoryMap(
    territory,
    territoryMapMarkers(territory, {
      privacy,
      formatAddress: formatDoorAddress,
    })
  )
  if (!showsMap && !canShare && !canGiveBack) return null
  const shown = [showsMap, canShare, canHandOff, canGiveBack].filter(
    Boolean
  ).length

  return (
    <View style={{ flexDirection: 'row', gap: shown > 2 ? 6 : 8 }}>
      <TerritoryMapButton
        territory={territory}
        streetId={street.id}
        privacy={privacy}
        onOpen={onOpenMap}
        fill={shown > 1}
      />
      {canShare && (
        <TerritoryPill
          icon={UsersIcon}
          label={i18n.t('territories.share.action')}
          onPress={onShare}
          testID='street-share'
          fill
        />
      )}
      {canHandOff && (
        <TerritoryPill
          icon={HandHelpingIcon}
          label={i18n.t('territories.share.handOffAction')}
          onPress={onHandOff}
          testID='street-handoff'
          fill
        />
      )}
      {canGiveBack && (
        <TerritoryPill
          icon={UndoIcon}
          label={i18n.t('territories.share.giveBack')}
          onPress={giveBack}
          testID='street-give-back'
          fill
        />
      )}
    </View>
  )
}

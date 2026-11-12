import { useState } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Eye as EyeIcon } from 'lucide-react-native'
import Header from '@/components/ui/layout/Header'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import i18n from '@/lib/locales'
import GuestPageBody from '@/features/territories/components/sharing/GuestPageBody'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import { linkEndsText } from '@/features/territories/lib/shareText'
import {
  addPeople,
  isShareLive,
  personById,
  sharedStreets,
} from '@/features/territories/lib/sharing'
import { territoryTitle } from '@/features/territories/lib/territoryTitle'
import { useTerritory } from '@/features/territories/stores/territories'
import type { Territory } from '@/features/territories/types/territory'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryGuest'>

function PreviewNote() {
  const theme = useTheme()
  return (
    <View
      testID='guest-preview-note'
      accessibilityRole='summary'
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderRadius: 20,
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon icon={EyeIcon} size={22} color={theme.colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('territories.share.guestPreview_title')}
        </Text>
        <Text style={{ fontSize: theme.fontSize('sm') }}>
          {i18n.t('territories.share.guestPreview_description')}
        </Text>
      </View>
    </View>
  )
}

export default function TerritoryGuestScreen({ route }: Props) {
  const theme = useTheme()
  const { territoryId, shareId } = route.params
  const stored = useTerritory(territoryId)
  const [territory, setTerritory] = useState(stored)
  const sharing = useTerritorySharing()
  const privacy = useDoorRecordPrivacy()
  const { now } = useNow()
  const [guestId, setGuestId] = useState<string>()
  const share = territory?.shares?.find((entry) => entry.id === shareId)

  if (!territory || !share) return null

  const live = isShareLive(share, Math.max(now, Date.now()))
  const guest = personById(territory, guestId)
  const change = (apply: (current: Territory) => Territory) =>
    setTerritory((current) => current && apply(current))

  const join = (name: string) => {
    const id = Crypto.randomUUID()
    change(
      (current) =>
        addPeople(current, [
          { id, name, kind: 'guest', shareId, addedAt: Date.now() },
        ]).territory
    )
    setGuestId(id)
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        noInsets
        buttonType='back'
        title={i18n.t('territories.share.previewGuestTitle')}
      />
      <GuestPageBody
        territory={territory}
        streets={sharedStreets(territory, share)}
        title={territoryTitle(territory)}
        ownerName={territory.received?.from.name ?? sharing.ownName}
        endsText={linkEndsText(share)}
        live={live}
        guest={guest ? { id: guest.id, name: guest.name } : null}
        houseRecords={!privacy}
        notice={<PreviewNote />}
        onJoin={join}
        onChange={change}
      />
    </View>
  )
}

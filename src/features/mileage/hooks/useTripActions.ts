import { Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useNavigation } from '@react-navigation/native'
import { toast } from '@/stores/toasts'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'

import confirmDestructive from '@/lib/confirmDestructive'
import { buildMileageIndex } from '@/lib/mileage/calc'
import { getMileageView } from '@/stores/mileageView'
import { deleteTrip } from '@/stores/mileageWrites'
import { buildTripText } from '@/features/mileage/lib/report'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageSharing, {
  currentMileagePeople,
} from '@/features/mileage/hooks/useMileageSharing'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Trip } from '@/types/mileage'

export default function useTripActions() {
  const navigation = useNavigation<RootStackNavigation>()
  const format = useMileageFormatter()
  const { buddies, ownName } = useMileageSharing()
  const text = (trip: Trip) => {
    const view = getMileageView()
    return buildTripText(
      trip,
      view.vehicles,
      buildMileageIndex(view.vehicleSetups, view.fuelPrices),
      format,
      { people: currentMileagePeople(buddies), ownName }
    )
  }

  const edit = (trip: Trip) =>
    navigation.navigate('MileageTripForm', { tripId: trip.id })

  const logAgain = (trip: Trip) =>
    navigation.navigate('MileageTripForm', { duplicateOf: trip.id })

  const share = async (trip: Trip) => {
    await Share.share({ message: text(trip) })
  }

  const copy = async (trip: Trip) => {
    await Clipboard.setStringAsync(text(trip))
    Haptics.success().catch(() => {})
    toast.success(i18n.t('copied'), { durationMs: 2000 })
  }

  const requestDelete = (trip: Trip, onDeleted?: () => void) =>
    confirmDestructive({
      title: i18n.t('mileage.deleteTrip_title'),
      description: i18n.t('mileage.deleteTrip_description'),
      onConfirm: () => {
        deleteTrip(trip.id)

        toast.success(i18n.t('success'), {
          message: i18n.t('deleted'),
        })
        onDeleted?.()
      },
    })

  const menu = (trip: Trip): ContextMenuEntries => [
    [
      {
        id: 'edit',
        title: i18n.t('edit'),
        systemImage: 'pencil',
        onPress: () => edit(trip),
      },
      {
        id: 'log_again',
        title: i18n.t('mileage.logAgain'),
        systemImage: 'arrow.clockwise',
        onPress: () => logAgain(trip),
      },
    ],
    [
      {
        id: 'share',
        title: i18n.t('shareEllipsis'),
        systemImage: 'square.and.arrow.up',
        onPress: () => void share(trip),
      },
      {
        id: 'copy',
        title: i18n.t('copy'),
        systemImage: 'doc.on.doc',
        onPress: () => void copy(trip),
      },
    ],
    [
      {
        id: 'delete',
        title: i18n.t('delete'),
        systemImage: 'trash',
        destructive: true,
        onPress: () => requestDelete(trip),
      },
    ],
  ]

  return { edit, logAgain, share, copy, requestDelete, menu }
}

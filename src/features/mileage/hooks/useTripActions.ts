import { Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import useMileage from '@/stores/mileage'
import { buildTripText } from '@/features/mileage/lib/report'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import useMileageIndex from '@/features/mileage/hooks/useMileageIndex'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Trip } from '@/types/mileage'

/** Edit, Log Again, Share, Copy, and Delete for one trip — row and details. */
export default function useTripActions(source: 'row' | 'details') {
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()
  const deleteTrip = useMileage((s) => s.deleteTrip)
  const vehicles = useMileage((s) => s.vehicles)
  const index = useMileageIndex()
  const format = useMileageFormatter()

  const edit = (trip: Trip) =>
    navigation.navigate('MileageTripForm', { tripId: trip.id })

  const logAgain = (trip: Trip) =>
    navigation.navigate('MileageTripForm', { duplicateOf: trip.id })

  const share = async (trip: Trip) => {
    const result = await Share.share({
      message: buildTripText(trip, vehicles, index, format),
    })
    if (result.action === Share.sharedAction)
      analytics.capture('mileage_trip_shared', { source, method: 'share' })
  }

  const copy = async (trip: Trip) => {
    await Clipboard.setStringAsync(buildTripText(trip, vehicles, index, format))
    Haptics.success().catch(() => {})
    toast.show(i18n.t('copied'), { native: true, duration: 2000 })
    analytics.capture('mileage_trip_shared', { source, method: 'copy' })
  }

  const requestDelete = (trip: Trip, onDeleted?: () => void) =>
    confirmDestructive({
      title: i18n.t('mileage.deleteTrip_title'),
      description: i18n.t('mileage.deleteTrip_description'),
      onConfirm: () => {
        deleteTrip(trip.id)
        analytics.capture('mileage_trip_deleted', { source })
        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
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

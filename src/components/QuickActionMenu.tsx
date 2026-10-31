import {
  Calendar as CalendarIcon,
  Car as CarIcon,
  Clock as ClockIcon,
  DoorOpen as DoorOpenIcon,
  IdCard as IdCardIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import usePublisher from '@/hooks/usePublisher'
import { usePreferences } from '@/stores/preferences'
import { useMileageView } from '@/stores/mileageView'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'

import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { RootStackNavigation } from '@/types/rootStack'

interface Props {
  navigation: RootStackNavigation
  onAction: () => void
  /** Shown above the actions (Scribe AI's Speak an update, from the app tier). */
  leading?: ReactNode
}

type QuickActionOption =
  | 'logVisit'
  | 'addTime'
  | 'addContact'
  | 'addPlan'
  | 'logTrip'

/** One action set for the compact sheet and the iPad anchored menu. */
export default function QuickActionMenu({
  navigation,
  onAction,
  leading,
}: Props) {
  const { showsTimer } = usePublisher()
  const tracksMileage = usePreferences((s) => s.mileageTrackingEnabled === true)
  const hasActiveCar = useMileageView((view) =>
    view.vehicles.some((v) => !v.archived)
  )
  const handleQuickAction = (action: QuickActionOption) => {
    onAction()
    switch (action) {
      case 'logVisit':
        navigation.navigate('Log Visit')
        break
      case 'addTime':
        navigation.navigate('Add Time')
        break
      case 'addContact':
        navigation.navigate('Contact Form', { id: Crypto.randomUUID() })
        break
      case 'addPlan':
        navigation.navigate('PlanDay', {})
        break
      case 'logTrip':
        // Without an active car, add one first; its form continues to the trip.
        if (hasActiveCar)
          navigation.navigate('MileageTripForm', { source: 'quick_action' })
        else
          navigation.navigate('MileageVehicleForm', {
            source: 'quick_action',
            thenLogTrip: true,
          })
        break
    }
  }
  return (
    <View style={{ gap: 10 }}>
      {leading}
      {/* Add Time stays first: people reach for the top row out of habit. */}
      {showsTimer && (
        <ActionButton
          text='addTime'
          icon={ClockIcon}
          onPress={() => handleQuickAction('addTime')}
        />
      )}
      <ActionButton
        text='logVisitAction'
        icon={DoorOpenIcon}
        onPress={() => handleQuickAction('logVisit')}
      />
      <ActionButton
        text='createPlan'
        icon={CalendarIcon}
        onPress={() => handleQuickAction('addPlan')}
      />
      <ActionButton
        text='addContact'
        icon={IdCardIcon}
        onPress={() => handleQuickAction('addContact')}
      />
      {tracksMileage && (
        <ActionButton
          text='mileage.logTrip'
          icon={CarIcon}
          onPress={() => handleQuickAction('logTrip')}
        />
      )}
    </View>
  )
}

function ActionButton(props: {
  onPress?: () => void
  text: TranslationKey
  icon: AppIcon
}) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={props.onPress}
      style={{
        justifyContent: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: theme.colors.accent,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
    >
      <XView style={{ gap: 10 }}>
        <IconButton icon={props.icon} color={theme.colors.textInverse} />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textInverse,
          }}
        >
          {i18n.t(props.text)}
        </Text>
      </XView>
    </Button>
  )
}

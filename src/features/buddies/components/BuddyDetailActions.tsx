import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  CalendarDays as CalendarDaysIcon,
  CalendarPlus as CalendarPlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import type { AppIcon } from '@/components/ui/LucideIcon'

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: AppIcon
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1 }}>
      <Button
        onPress={onPress}
        style={{
          alignItems: 'center',
          gap: 6,
          paddingVertical: 12,
          paddingHorizontal: 8,
          borderRadius: theme.numbers.borderRadiusLg,
          backgroundColor: theme.colors.backgroundLighter,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </Button>
    </View>
  )
}

/** Plan something with this buddy, or see them alongside everyone else. */
export default function BuddyDetailActions({ inboxId }: { inboxId: string }) {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <XView style={{ gap: 12 }}>
      <ActionTile
        icon={CalendarPlusIcon}
        label={i18n.t('buddies_inviteToPlan')}
        onPress={() => {
          analytics.capture('buddy_plan_invite_opened', {
            source: 'buddy_detail',
          })
          navigation.navigate('PlanDay', { prefill: { buddies: [inboxId] } })
        }}
      />
      <ActionTile
        icon={CalendarDaysIcon}
        label={i18n.t('buddies_viewOnCalendar')}
        onPress={() =>
          navigation.navigate('Root', { screen: 'Schedule' } as never)
        }
      />
    </XView>
  )
}

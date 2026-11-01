import { useNavigation } from '@react-navigation/native'
import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddyListRow from '@/features/buddies/components/BuddyListRow'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { type Buddy, ownSettingsCount } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddySettingsLink({ buddy }: { buddy: Buddy }) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const own = useBuddies((state) =>
    ownSettingsCount(buddy, state.alertOverrides)
  )
  if (buddy.status !== 'active') return null

  return (
    <Section style={{ paddingVertical: 0 }}>
      <BuddyListRow
        last
        leading={
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <LucideIcon
              icon={SlidersHorizontalIcon}
              size={18}
              color={theme.colors.textAlt}
            />
          </View>
        }
        title={i18n.t('buddies_buddySettings')}
        subtitle={
          own > 0
            ? i18n.t('buddies_scopeBuddyOwn', {
                count: own,
                name: buddyDisplayName(buddy),
              })
            : i18n.t('buddies_buddySettingsFollowsAll')
        }
        onPress={() =>
          navigation.navigate('Buddies Settings', { inboxId: buddy.inboxId })
        }
        accessory={
          <LucideIcon
            icon={ChevronForwardIcon}
            size={18}
            color={theme.colors.textAlt}
          />
        }
      />
    </Section>
  )
}

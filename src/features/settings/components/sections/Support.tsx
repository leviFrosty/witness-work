import {
  CalendarClock as CalendarClockIcon,
  Heart as HeartIcon,
  Medal as MedalIcon,
  Share2 as Share2Icon,
} from 'lucide-react-native'
import { Alert, Platform } from 'react-native'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import i18n from '@/lib/locales'
import links from '@/constants/links'
import useIsSupporter from '@/hooks/useIsSupporter'
import { isFoundingSupporter } from '@/lib/foundingSupporter'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { useSubscriptionStatus } from '@/features/supporter/hooks/useManageSubscription'
import { formatDisplay } from '@/lib/dates'

/** The supporter's status, first in Support. */
const SupporterRow = ({ since }: { since: Date }) => {
  const theme = useTheme()
  const isFounding = isFoundingSupporter(since)
  return (
    <GroupedListRow
      icon={HeartIcon}
      iconColor={theme.colors.supporter}
      iconFill={theme.colors.supporter}
      tint={theme.colors.supporterTranslucent}
      label={i18n.t(
        isFounding ? 'supporterCardFoundingTitle' : 'supporterCardTitle'
      )}
      sublabel={i18n.t(
        isFounding ? 'supporterCardFoundingSince' : 'supporterCardSince',
        { year: formatDisplay(since, 'YYYY') }
      )}
    />
  )
}

const SupportSection = ({
  handleNavigate,
  selectedDestination,
  onManageSubscription,
}: SettingsSectionProps & { onManageSubscription: () => void }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const subscription = useSubscriptionStatus()
  const { since } = useIsSupporter()

  return (
    <GroupedListSection title={i18n.t('support')}>
      {since && <SupporterRow since={since} />}
      <GroupedListRow
        icon={HeartIcon}
        iconColor={theme.colors.supporter}
        iconFill={theme.colors.supporter}
        label={i18n.t('becomeSupporter')}
        onPress={() => {
          navigation.navigate('Paywall', { source: 'settings_support' })
        }}
      />
      {subscription.state.kind !== 'none' && (
        <GroupedListRow
          icon={CalendarClockIcon}
          label={i18n.t('manageSubscription')}
          sublabel={subscription.label ?? undefined}
          onPress={onManageSubscription}
        />
      )}
      <GroupedListRow
        icon={Share2Icon}
        label={i18n.t('shareApp_title')}
        onPress={() => handleNavigate('ShareApp')}
        selected={selectedDestination === 'ShareApp'}
      />
      <GroupedListRow
        icon={MedalIcon}
        label={i18n.t('rateWitnessWorkOnAppStore')}
        accessory='external'
        onPress={() => {
          try {
            openURL(
              Platform.OS === 'android' ? links.playStore : links.appStoreReview
            )
          } catch (error) {
            Alert.alert(
              i18n.t('appleAppStoreReviewErrorTitle'),
              i18n.t('appleAppStoreReviewErrorMessage')
            )
          }
        }}
      />
    </GroupedListSection>
  )
}
export default SupportSection

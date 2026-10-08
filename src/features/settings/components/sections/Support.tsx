import {
  CalendarClock as CalendarClockIcon,
  ChevronRight as ChevronRightIcon,
  ExternalLink as ExternalLinkIcon,
  Heart as HeartIcon,
  Medal as MedalIcon,
  Share2 as Share2Icon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Alert, Platform, View } from 'react-native'
import { useState } from 'react'
import moment from 'moment'
import Section from '@/components/ui/inputs/Section'
import i18n from '@/lib/locales'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import links from '@/constants/links'
import IconButton from '@/components/ui/IconButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import Text from '@/components/ui/MyText'
import useIsSupporter from '@/hooks/useIsSupporter'
import { isFoundingSupporter } from '@/lib/foundingSupporter'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import ManageSubscriptionSheet from '@/features/supporter/components/ManageSubscriptionSheet'
import { useSubscriptionStatus } from '@/features/supporter/hooks/useManageSubscription'

const SupporterCard = () => {
  const theme = useTheme()
  const { since } = useIsSupporter()
  if (!since) return null
  const isFounding = isFoundingSupporter(since)
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        marginTop: 6,
        marginBottom: 8,
        marginHorizontal: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.supporter,
        backgroundColor: theme.colors.supporterTranslucent,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={HeartIcon}
          size={13}
          color={theme.colors.supporter}
          fill={theme.colors.supporter}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.text,
          }}
        >
          {i18n.t(
            isFounding ? 'supporterCardFoundingTitle' : 'supporterCardTitle'
          )}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t(
            isFounding ? 'supporterCardFoundingSince' : 'supporterCardSince',
            { year: moment(since).format('YYYY') }
          )}
        </Text>
      </View>
    </View>
  )
}

const SupportSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const subscription = useSubscriptionStatus()
  const [manageOpen, setManageOpen] = useState(false)

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle alignWithIcons text={i18n.t('support')} />

      <SupporterCard />

      <Section>
        <InputRowButton
          leftIcon={HeartIcon}
          leftIconColor={theme.colors.supporter}
          leftIconFill={theme.colors.supporter}
          label={i18n.t('becomeSupporter')}
          onPress={() => {
            navigation.navigate('Paywall', { source: 'settings_support' })
          }}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        {subscription.state.kind !== 'none' && (
          <InputRowButton
            leftIcon={CalendarClockIcon}
            label={i18n.t('manageSubscription')}
            sublabel={subscription.label ?? undefined}
            onPress={() => setManageOpen(true)}
          >
            <IconButton icon={ChevronRightIcon} />
          </InputRowButton>
        )}
        <InputRowButton
          leftIcon={Share2Icon}
          label={i18n.t('shareApp_title')}
          onPress={() => handleNavigate('ShareApp')}
          selected={selectedDestination === 'ShareApp'}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={MedalIcon}
          label={i18n.t('rateWitnessWorkOnAppStore')}
          onPress={() => {
            try {
              openURL(
                Platform.OS === 'android'
                  ? links.playStore
                  : links.appStoreReview
              )
            } catch (error) {
              Alert.alert(
                i18n.t('appleAppStoreReviewErrorTitle'),
                i18n.t('appleAppStoreReviewErrorMessage')
              )
            }
          }}
          lastInSection
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
      </Section>
      <ManageSubscriptionSheet
        open={manageOpen}
        setOpen={setManageOpen}
        source='settings'
      />
    </View>
  )
}
export default SupportSection

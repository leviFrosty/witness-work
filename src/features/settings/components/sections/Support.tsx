import {
  ChevronRight as ChevronRightIcon,
  ExternalLink as ExternalLinkIcon,
  Globe as GlobeIcon,
  Heart as HeartIcon,
  Medal as MedalIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Alert, View } from 'react-native'
import moment from 'moment'
import Section from '@/components/ui/inputs/Section'
import i18n from '@/lib/locales'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import links from '@/constants/links'
import IconButton from '@/components/ui/IconButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import Text from '@/components/ui/MyText'
import useIsSupporter from '@/hooks/useIsSupporter'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'

const SupporterCard = () => {
  const theme = useTheme()
  const { since } = useIsSupporter()
  if (!since) return null
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
          backgroundColor: theme.colors.supporter,
        }}
      >
        <LucideIcon
          icon={HeartIcon}
          size={13}
          color={theme.colors.textInverse}
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
          {i18n.t('supporterCardTitle')}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('supporterCardSince', {
            year: moment(since).format('YYYY'),
          })}
        </Text>
      </View>
    </View>
  )
}

const SupportSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('support')} />

      <SupporterCard />

      <Section>
        <InputRowButton
          leftIcon={HeartIcon}
          label={i18n.t('becomeSupporter')}
          onPress={() => navigation.navigate('Paywall')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={MedalIcon}
          label={i18n.t('rateWitnessWorkOnAppStore')}
          onPress={() => {
            try {
              openURL(links.appStoreReview)
            } catch (error) {
              Alert.alert(
                i18n.t('appleAppStoreReviewErrorTitle'),
                i18n.t('appleAppStoreReviewErrorMessage')
              )
            }
          }}
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>

        <InputRowButton
          leftIcon={GlobeIcon}
          label={i18n.t('helpTranslate')}
          onPress={async () => {
            Alert.alert(
              i18n.t('helpTranslateTitle'),
              i18n.t('helpTranslate_message'),
              [
                {
                  text: i18n.t('cancel'),
                  style: 'cancel',
                },
                {
                  text: i18n.t('yes'),
                  onPress: () => openURL(links.crowdin),
                },
              ]
            )
          }}
          lastInSection
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}
export default SupportSection

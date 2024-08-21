import { Alert, Platform, View } from 'react-native'
import Section from '../../../components/inputs/Section'
import i18n from '../../../lib/locales'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faArrowUpRightFromSquare,
  faChevronRight,
  faGlobe,
  faHeart,
  faRankingStar,
} from '@fortawesome/free-solid-svg-icons'
import links from '../../../constants/links'
import IconButton from '../../../components/IconButton'
import SectionTitle from '../shared/SectionTitle'
import { openURL } from '../../../lib/links'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../../../stacks/RootStack'
import { email } from '../../../constants/contactInformation'

const SupportSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('support')} />

      <Section>
        <InputRowButton
          leftIcon={faHeart}
          label={i18n.t('donate')}
          onPress={() => navigation.navigate('Donate')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faRankingStar}
          label={
            Platform.OS === 'android'
              ? i18n.t('rateWitnessWorkOnPlayStore')
              : i18n.t('rateWitnessWorkOnAppStore')
          }
          onPress={() => {
            try {
              Platform.OS === 'android'
                ? openURL(links.playStoreReview)
                : openURL(links.appStoreReview)
            } catch (error) {
              Alert.alert(
                Platform.OS === 'android'
                  ? i18n.t('androidAppStoreReviewErrorTitle')
                  : i18n.t('appleAppStoreReviewErrorTitle'),
                Platform.OS === 'android'
                  ? i18n.t('androidAppStoreReviewErrorMessage')
                  : i18n.t('appleAppStoreReviewErrorMessage')
              )
            }
          }}
        >
          <IconButton icon={faArrowUpRightFromSquare} />
        </InputRowButton>

        <InputRowButton
          leftIcon={faGlobe}
          label={i18n.t('helpTranslate')}
          onPress={async () => {
            const emailMe = async () => {
              const subjectText = '[WitnessWork] Help Translate'
              const bodyText = `${i18n.t(
                'iWouldLikeToHelpTranslate'
              )}: --------------`
              const subject = encodeURIComponent(subjectText)
              const body = encodeURIComponent(bodyText)

              openURL(`mailto:${email}?subject=${subject}&body=${body}`, {
                alert: {
                  description: i18n.t('failedToOpenMailApplication'),
                },
              })
            }

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
                  onPress: emailMe,
                },
              ]
            )
          }}
          lastInSection
        >
          <IconButton icon={faArrowUpRightFromSquare} />
        </InputRowButton>
      </Section>
    </View>
  )
}
export default SupportSection

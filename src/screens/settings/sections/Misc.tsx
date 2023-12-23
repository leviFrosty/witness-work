import { View } from 'react-native'
import { SettingsSectionProps } from '../Settings'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faCode,
  faFileContract,
  faTag,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import * as Linking from 'expo-linking'
import links from '../../../constants/links'
import * as Sentry from 'sentry-expo'
import SettingsSectionTitle from '../shared/SettingsSectionTitle'

const MiscSection = ({ handleNavigate }: SettingsSectionProps) => {
  return (
    <View style={{ gap: 3 }}>
      <SettingsSectionTitle text={i18n.t('misc')} />

      <Section>
        <InputRowButton
          leftIcon={faTag}
          label={i18n.t('whatsNew')}
          onPress={() => handleNavigate('Whats New')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faCode}
          label={i18n.t('viewSource')}
          onPress={() => {
            try {
              Linking.openURL(links.githubRepo)
            } catch (error) {
              Sentry.Native.captureException(error)
            }
          }}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileContract}
          label={i18n.t('privacyPolicy')}
          onPress={() => {
            try {
              Linking.openURL(links.privacyPolicy)
            } catch (error) {
              Sentry.Native.captureException(error)
            }
          }}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default MiscSection

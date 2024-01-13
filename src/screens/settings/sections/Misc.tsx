import { View } from 'react-native'
import { SettingsSectionProps } from '../SettingsScreen'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faArrowUpRightFromSquare,
  faChevronRight,
  faCode,
  faFileContract,
  faFileExport,
  faTag,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import links from '../../../constants/links'
import SectionTitle from '../shared/SectionTitle'
import { openURL } from '../../../lib/links'

const MiscSection = ({ handleNavigate }: SettingsSectionProps) => {
  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('misc')} />

      <Section>
        <InputRowButton
          leftIcon={faTag}
          label={i18n.t('whatsNew')}
          onPress={() => handleNavigate('Whats New')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileExport}
          label={i18n.t('importAndExport')}
          onPress={() => handleNavigate('Import and Export')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faCode}
          label={i18n.t('viewSource')}
          onPress={() => openURL(links.githubRepo)}
        >
          <IconButton icon={faArrowUpRightFromSquare} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileContract}
          label={i18n.t('privacyPolicy')}
          onPress={() => openURL(links.privacyPolicy)}
        >
          <IconButton icon={faArrowUpRightFromSquare} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faFileContract}
          label={i18n.t('termsOfUse')}
          onPress={() => openURL(links.termsOfUse)}
          lastInSection
        >
          <IconButton icon={faArrowUpRightFromSquare} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default MiscSection

import {
  ChevronRight as ChevronRightIcon,
  Code as CodeIcon,
  ExternalLink as ExternalLinkIcon,
  Library as LibraryIcon,
  ScrollText as ScrollTextIcon,
  ShieldHalf as ShieldHalfIcon,
  Tag as TagIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import links from '@/constants/links'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { openURL } from '@/lib/links'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'

const AboutSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const notesImportEnabled = useNotesImportEnabled()

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle alignWithIcons text={i18n.t('about')} />

      <Section>
        <InputRowButton
          leftIcon={TagIcon}
          label={i18n.t('whatsNew')}
          onPress={() => handleNavigate('Whats New')}
          selected={selectedDestination === 'Whats New'}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={CodeIcon}
          label={i18n.t('faq_sourceCode')}
          onPress={() => openURL(links.githubRepo)}
          url={links.githubRepo}
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={ScrollTextIcon}
          label={i18n.t('privacyPolicy')}
          onPress={() => openURL(links.privacyPolicy)}
          url={links.privacyPolicy}
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={ScrollTextIcon}
          label={i18n.t('termsOfUse')}
          onPress={() => openURL(links.termsOfUse)}
          url={links.termsOfUse}
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
        {notesImportEnabled && (
          <InputRowButton
            leftIcon={ShieldHalfIcon}
            label={i18n.t('notesImport_privacyLink')}
            onPress={() => openURL(links.openRouterZdr)}
            url={links.openRouterZdr}
          >
            <IconButton icon={ExternalLinkIcon} />
          </InputRowButton>
        )}
        <InputRowButton
          leftIcon={LibraryIcon}
          label={i18n.t('openSourceLicenses')}
          onPress={() => handleNavigate('OpenSourceLicenses')}
          selected={selectedDestination === 'OpenSourceLicenses'}
          lastInSection
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default AboutSection

import {
  Code as CodeIcon,
  Library as LibraryIcon,
  ScrollText as ScrollTextIcon,
  ShieldHalf as ShieldHalfIcon,
  Tag as TagIcon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import links from '@/constants/links'
import { openURL } from '@/lib/links'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { useScribeEnabled } from '@/features/scribe'

const AboutSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const scribeEnabled = useScribeEnabled()

  return (
    <GroupedListSection title={i18n.t('about')}>
      <GroupedListRow
        icon={TagIcon}
        label={i18n.t('whatsNew')}
        onPress={() => handleNavigate('Whats New')}
        selected={selectedDestination === 'Whats New'}
      />
      <GroupedListRow
        icon={CodeIcon}
        label={i18n.t('faq_sourceCode')}
        onPress={() => openURL(links.githubRepo)}
        url={links.githubRepo}
        accessory='external'
      />
      <GroupedListRow
        icon={ScrollTextIcon}
        label={i18n.t('privacyPolicy')}
        onPress={() => openURL(links.privacyPolicy)}
        url={links.privacyPolicy}
        accessory='external'
      />
      <GroupedListRow
        icon={ScrollTextIcon}
        label={i18n.t('termsOfUse')}
        onPress={() => openURL(links.termsOfUse)}
        url={links.termsOfUse}
        accessory='external'
      />
      {scribeEnabled && (
        <GroupedListRow
          icon={ShieldHalfIcon}
          label={i18n.t('scribe_privacyLink')}
          onPress={() => openURL(links.openRouterZdr)}
          url={links.openRouterZdr}
          accessory='external'
        />
      )}
      <GroupedListRow
        icon={LibraryIcon}
        label={i18n.t('openSourceLicenses')}
        onPress={() => handleNavigate('OpenSourceLicenses')}
        selected={selectedDestination === 'OpenSourceLicenses'}
      />
    </GroupedListSection>
  )
}

export default AboutSection

import {
  ChevronRight as ChevronRightIcon,
  Code as CodeIcon,
  ExternalLink as ExternalLinkIcon,
  ScrollText as ScrollTextIcon,
  Tag as TagIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import links from '@/constants/links'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { openURL } from '@/lib/links'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'
import { usePreferences } from '@/stores/preferences'
import useTheme from '@/contexts/theme'

const MiscSection = ({ handleNavigate }: SettingsSectionProps) => {
  const theme = useTheme()
  const { unreadReleaseNotes } = usePreferences()

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle alignWithIcons text={i18n.t('misc')} />

      <Section>
        <InputRowButton
          leftIcon={TagIcon}
          label={i18n.t('whatsNew')}
          onPress={() => handleNavigate('Whats New')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {unreadReleaseNotes && (
              <View
                accessibilityLabel={i18n.t('new')}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.accent,
                }}
              />
            )}
            <IconButton icon={ChevronRightIcon} />
          </View>
        </InputRowButton>
        <InputRowButton
          leftIcon={CodeIcon}
          label={i18n.t('viewSource')}
          onPress={() => openURL(links.githubRepo)}
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={ScrollTextIcon}
          label={i18n.t('privacyPolicy')}
          onPress={() => openURL(links.privacyPolicy)}
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
        <InputRowButton
          leftIcon={ScrollTextIcon}
          label={i18n.t('termsOfUse')}
          onPress={() => openURL(links.termsOfUse)}
          lastInSection
        >
          <IconButton icon={ExternalLinkIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default MiscSection

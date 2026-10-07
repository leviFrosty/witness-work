import {
  ChevronRight as ChevronRightIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'

const ContactSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  return (
    <View style={{ gap: 3 }}>
      <SectionTitle alignWithIcons text={i18n.t('helpCenter')} />
      <Section>
        <InputRowButton
          lastInSection
          leftIcon={CircleQuestionMarkIcon}
          label={i18n.t('helpCenter')}
          selected={selectedDestination === 'FAQ'}
          onPress={() => {
            handleNavigate('FAQ')
          }}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default ContactSection

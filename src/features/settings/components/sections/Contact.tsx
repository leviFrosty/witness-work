import { CircleQuestionMark as CircleQuestionMarkIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'

const ContactSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  return (
    <GroupedListSection title={i18n.t('helpCenter')}>
      <GroupedListRow
        icon={CircleQuestionMarkIcon}
        label={i18n.t('helpCenter')}
        selected={selectedDestination === 'FAQ'}
        onPress={() => {
          handleNavigate('FAQ')
        }}
      />
    </GroupedListSection>
  )
}

export default ContactSection

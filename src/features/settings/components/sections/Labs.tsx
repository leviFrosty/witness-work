import { FlaskConical as FlaskConicalIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { labIds, resolveLab, useLabsStore } from '@/lib/labs'
import { SettingsSectionProps } from '@/features/settings/screens/settingScreen'

const LabsSection = ({
  handleNavigate,
  selectedDestination,
}: SettingsSectionProps) => {
  const theme = useTheme()
  const choices = useLabsStore((state) => state.choices)
  const ids = labIds()
  if (ids.length === 0) return null

  const enabled = ids.filter((id) => resolveLab(choices, id)).length

  return (
    <GroupedListSection title={i18n.t('labs_title')}>
      <GroupedListRow
        icon={FlaskConicalIcon}
        label={i18n.t('labs_title')}
        testID='settings-labs'
        trailing={
          <Text numberOfLines={1} style={{ color: theme.colors.textAlt }}>
            {i18n.t('labs_enabledCount', { enabled, total: ids.length })}
          </Text>
        }
        onPress={() => handleNavigate('Labs')}
        selected={selectedDestination === 'Labs'}
      />
    </GroupedListSection>
  )
}

export default LabsSection

import { Bug as BugIcon } from 'lucide-react-native'
import i18n from '@/lib/locales'
import {
  GroupedListSection,
  GroupedListSwitchRow,
} from '@/components/ui/GroupedList'
import { usePreferences } from '@/stores/preferences'

const AdvancedSection = () => {
  const developerTools = usePreferences((s) => s.developerTools)
  const set = usePreferences((s) => s.set)

  return (
    <GroupedListSection title={i18n.t('advanced')}>
      <GroupedListSwitchRow
        icon={BugIcon}
        label={i18n.t('developerTools')}
        info={i18n.t('developerTools_info')}
        value={developerTools}
        onValueChange={(value) => set({ developerTools: value })}
      />
    </GroupedListSection>
  )
}

export default AdvancedSection

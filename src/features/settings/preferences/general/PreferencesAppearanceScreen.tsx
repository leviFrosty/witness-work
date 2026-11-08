import { GroupedList } from '@/components/ui/GroupedList'
import AppearancePreferencesSection from '@/features/settings/preferences/general/AppearancePreferencesSection'

const PreferencesAppearanceScreen = () => {
  return (
    <GroupedList>
      <AppearancePreferencesSection />
    </GroupedList>
  )
}

export default PreferencesAppearanceScreen
